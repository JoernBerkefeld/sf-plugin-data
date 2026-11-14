# Data360 Salesforce CLI plugin

`sf-plugin-data` adds `sf data360 retrieve`, `sf data360 deploy` and exact native
DMO/DLO/mapping/Data Stream `sf data360 delete` to Salesforce CLI
for downloading portable Data360 configuration, previewing local changes and applying
supported, guarded updates. Support is resource- and operation-specific: this is
**not a complete backup, restore or migration tool**. Deployment can cause processing;
preview first and read the limits below.

Successful human CRUD lines use `created|updated|deleted <type> <apiName>`.
The suffix ` (server is still processing)` appears only when the command retains
positive evidence of an acknowledged, unsettled operation: an explicit DLO
`PROCESSING` write response (unless an existing independent read confirms `ACTIVE`
and the requested definition), or the guarded IR deletion acknowledgement.
No suffix is not a universal activation or physical-cleanup guarantee: some
operations confirm only the definition or accepted receipt. HTTP 204 alone and
`--allow-processing` are not evidence of ongoing processing. Preview, unchanged,
read and download output do not receive this suffix; failed or unknown outcomes
remain failures, not successful queued operations.

## How to install

Requires Salesforce CLI, Node.js `^22.22.2 || ^24.15.0` and npm. The package identity
is `sf-plugin-data`; registry availability and released-package acceptance are not
established here. For a **developer installation**, run from a checkout of this repository:

```sh
npm ci --no-workspaces
npm run build --no-workspaces
sf plugins link .
sf data360 --help
```

Org-backed operations also require an authenticated Data360-enabled org with the
necessary permissions. Sign in with `sf org login web --alias source` and select it
explicitly with `--target-org source`. Linking a plugin does not grant org access.
See [Local development](#local-development) for verification commands.

## Resource and operation support

The four support columns describe **this plugin's public commands**, not everything
Salesforce can do. **Partial** means an implemented bounded subset, not full-resource
or released-package qualification. **Unavailable** means no public plugin operation;
it does not mean Salesforce lacks that capability. No resource has full CRUD support.
Retrieve uses `sf data360 retrieve`; Create/Update use `sf data360 deploy`.
Delete uses `sf data360 delete` for the bounded native families described below,
each selected by name with `-m` and read from the org before anything is deleted.
Exact selectors, processing acknowledgements and family-specific limits apply.

**Route legend (separate from support):**
<img src="assets/icons/cli.svg" width="20" height="20" alt="CLI" title="Standard Salesforce CLI operation" />
**CLI (blue)** = an actual out-of-the-box Salesforce CLI operation, such as
`sf project retrieve start`;
<img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />
**API (purple)** = an API-led operation, **including** `sf api request rest` and the
documented MCP execute facade. Cell icons identify mechanisms used by that supported
plugin operation; two icons mean it combines both. They do not add support or label
custom `sf data360 …` commands as OOTB. Unavailable operations have no icons.
The last column retains resource-specific scope and limitations, not additional
plugin features.

| Resource                                   | Retrieve                                                                                                                                                                                                            | Create                                                                                                                            | Update                                                                                                                          | Delete                                                                                                                                  | Scope / limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data Model Objects (DMOs), `dmo`           | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                                                                                                               | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                             | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                           | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Exact native definition deletion" />                    | One native route, default/auto API68 (numeric pins from 61 kept): `data360/dmo/<ApiName>__dlm.dmo-meta.json`, all/type/exact retrieval of the authored fields (no System, system-named or `KQ_` fields; primary keys and the standard fields of a standard DMO stay), create or update by target name, exact-name delete. No local allowlists: category, field types, labels, descriptions and extra keys are sent as authored and Salesforce decides. Observed at API68 on empty, unmapped custom DMOs in the default data space: categories Profile, Engagement and Other; ten field data types; update of object label and description, existing field labels and added fields. Refused before any write: changing a field's data type or the primary key, removing a field without `--allow-field-removal`, and any write to a platform-generated DMO or a custom DMO under a namespaced name. A standard DMO (`creationType` `Standard`, for example `ssot__Brand__dlm`) takes custom-field additions, edits and removals and changes of its object label and description only; its standard and system fields are never sent, its category is ignored, and it is never created or deleted (observed at API68 through the plugin on one standard DMO in two orgs, active in one of them). With `--allow-field-removal`, custom fields missing from the file are removed by a Metadata API destructive change for `CustomField`; the primary key and generated fields are never removed. A mapped field is removed only when the same command also deploys every mapping holding its pair, with the pair taken out of the mapping file; the removal runs in the DMO position and Salesforce drops the field's pairs with it. `sf data360 delete -m dmo:<Name__dlm> --field <Field__c>` removes named custom fields in one step: one destructive change for the fields (Salesforce drops their mapping pairs), then a refresh of the existing project files. Polled reads confirm writes; batches order DLO, DMO, mapping, relationship. Used by `--changed-since` and mixed selections. Removal of a mapped field is observed at API68 on custom DMOs with one and with two mappings. Data-bearing DMOs and fields, standard DMOs in active use, non-default data spaces, relationships and other API versions are not verified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Data Lake Objects (DLOs), `dlo`            | Available <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native API68 definition retrieval" />                                                                                             | Available <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native API68 standalone definition creation" /> | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Label changes and ordinary field additions" />  | Available <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Exact target definition deletion" />                  | API68/default native definition CRUD through authenticated standard CLI; canonical `data360/dlo/<FullApiName>__dll.dlo-meta.json`, operation-specific payloads and target-name auto POST/PATCH replace handcrafted requests. Create sends the category as the file states it (Salesforce decides; observed: Profile and Engagement) and, for Engagement, the event field `spec.eventDateTimeFieldName`; neither can change afterwards (`UNSUPPORTED_DLO_CATEGORY_CHANGE`, `UNSUPPORTED_DLO_EVENT_FIELD_CHANGE`). An existing DLO takes label changes and field additions only. A file for an existing DLO may omit the fields Salesforce generated (`cdp_sys_SourceVersion__c`, `DataSource__c`, `DataSourceObject__c`, `InternalOrganization__c`, `cdp_sys_PartitionDate__c` on Engagement DLOs and the key qualifier of the primary key, for example `KQ_Id__c`), and retrieve leaves them out; any other omitted or changed field is refused (`UNSUPPORTED_DLO_FIELD_CHANGE`). Metadata retrieval worked at 65–68 but complete-schema redeploy hit PK/qualifier failures. Explicit preview is read-only; delete executes without prompting. Not ingestion or cascade cleanup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| DLO-to-DMO mappings, `mapping`             | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native mapping retrieval" />                                                                                                        | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native mapping creation" />                       | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Qualified desired-state pair reconciliation" /> | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Whole-mapping Metadata API deletion" />                 | Canonical native JSON; default/auto API68, numeric pins preserved. All/type/exact retrieval; explicit deploy/delete only. Installed API68 acceptance covers create, canonical retrieval, one additive pair, JSON Text removal with batch addition, both Text retarget directions and zero-write previews/repeats. Delete (native API 61 and up, default 68) removes the whole mapping, whatever pairs it holds, with one Metadata API destructive deployment for `ObjectSourceTargetMap`; preview is read-only, and polled reads confirm that the mapping is absent and that the other mappings and the field names of the DMO are unchanged. Only the last mapping of a custom DMO is refused, before any write (`MAPPING_LAST_MAPPING_DELETE_BLOCKED`): Salesforce does not delete it, so delete the DMO, which removes its mapping. The last mapping of a standard DMO is deleted normally. Separate installed API61 create, read and one-pair addition with omitted scope passed; pair removal is observed through the plugin at API 61, 64 and 68. Create and update send the pairs the file lists, whatever their data types and names, one source onto several targets and targets another mapping also holds; Salesforce decides. Pairs whose types differ get the preview notice `MAPPING_FIELD_TYPES_DIFFER`. Installed API68 cross-org acceptance additionally covers exact source retrieval, target-local DLO/DMO rebinding, create, one additive Text pair and a GET-only repeat. Not general cross-org schemas, populated objects or released-package qualification. The target is a custom DMO or a standard DMO (`creationType` `Standard`). The first mapping onto a standard DMO that is not yet enabled activates it permanently; the preview and the create item then carry the notice `MAPPING_ACTIVATES_STANDARD_DMO`. A file for an existing mapping may list only the authored pairs: the pairs Salesforce generated (three system pairs and the key qualifier pair) are taken from the org's copy and treated as part of the file, and retrieve writes the authored pairs only. The key pair (source primary key onto target primary key) must stay in the file (`MAPPING_PROTECTED_PAIR_REQUIRED`). A deploy removes any authored pair that the file no longer lists, including a pair onto a standard field and a pair that another mapping of the same DMO also holds; generated pairs and the primary-key pair stay. Observed at API68 through the plugin: a mapping created onto a standard DMO, already active in one org and inactive in another (there with the notice, the DMO enabled afterwards), its retrieved file deploying back unchanged, hand-written files with the authored pairs only deploying back unchanged onto a custom and a standard DMO, one such file adding a pair and dropping another, a pair onto a standard field removed by deploy, a field shared by two mappings of a custom DMO removed, a non-last mapping of a custom DMO deleted, the last one refused, and the only mapping of a standard DMO deleted in two orgs. |
| DMO field relationships, `relationship`    | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native relationship retrieval by source DMO" />                                                                                     | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native relationship creation" />                  | Unavailable                                                                                                                     | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Exact native relationship deletion" />                  | One native route, default/auto API68 (numeric pins from 61 kept): `data360/relationship/<Name>.relationship-meta.json` holding the source and target object and field, cardinality and owner. Retrieve takes a source DMO (`relationship:<Dmo__dlm>`) and writes every relationship whose source is that DMO; bare `relationship` is refused. Salesforce generates relationship names; deploy finds the relationship by its binding (source and target object and field), so a hand-written file may use any name. Present with the same cardinality and owner is `unchanged`, absent is created, a different cardinality or owner is refused (`RELATIONSHIP_CHANGE_UNSUPPORTED`): there is no update route, so delete and deploy again. Deploy never deletes relationships. Salesforce requires both DMOs to be mapped. Delete by name takes the source DMO from the selector (`relationship:<Dmo__dlm>:<Name>`); a source DMO that does not exist makes the delete `unchanged`. Batches order DLO, DMO, mapping, relationship. Observed at API68 through the plugin on empty custom DMOs in one org in the default data space; standard and data-bearing DMOs, non-default data spaces and other API versions are not verified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Data Transforms, `data-transform`          | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Exact native API68 definition retrieval" />                                                                                         | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Explicit create-only definition POST" />          | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Exact-ID label and description update" />       | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Guarded exact-ID delete with inventory settlement" />   | One exact canonical CUSTOM/BATCH/STL definition, API68/default only; compatible existing DLO prerequisites. Explicit create/update, GET-only preview and unchanged repeat, processing acknowledgment for changed execution. No upsert, run/schedule, provisioning or Git selection; one named transform per deploy, beside other families. Delete by name (`-m data-transform:<Name>`) resolves the record ID from the transform list and reads the definition from the org; unconfirmed settlement is reported nonzero. Offline regressions/local installed checks are separate from unperformed live public lifecycle acceptance. Native zero-row qualification is separate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Source object definitions                  | Unavailable                                                                                                                                                                                                         | Unavailable                                                                                                                       | Unavailable                                                                                                                     | Unavailable                                                                                                                             | Definition XML only, not connectors or credentials.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Data Streams, `data-stream`                | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Exact native stream retrieval" />                                                                                                   | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Guarded Ingestion API stream creation" />         | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Additive nonprimary Text mapping update" />     | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Guarded exact stream deletion" />                       | Exact API68/default Ingestion API/Other/UPSERT subset, alone or as the first deploy phase; portable JSON, preview and processing acknowledgement. Installed cross-org qualification covers source create/retrieve, connectionName-only target remap/create/retrieve, additive Text update, zero-write repeat and explicit cascade cleanup on both sides. Preserve-DLO deletion has separate bounded evidence. Not general connectors, populated data, other API versions or released-package qualification.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Calculated insights, `calculated-insight`  | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" /> <img src="assets/icons/cli.svg" width="20" height="20" alt="CLI" title="Standard Salesforce CLI operation" /> | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Bounded API68 draft creation" />                  | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                           | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Source-bound asynchronous deletion" />                  | Native API68 (default/`auto` or `68.0`; `65.0` refused): retrieve of ACTIVE insights, including run and SYSTEM_MANAGED ones; bounded draft create/edit, separate NOT_SCHEDULED publish, ACTIVE expression edit and source-paired delete of never-run NOT_SCHEDULED insights. Packaged insights and expressions outside the qualified shapes are refused. No calculation/general SQL guarantee.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Segments, `segment`                        | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native JSON definition retrieval" />                                                                                                | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Bounded absent-target creation" />                | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Bounded existing definition update" />          | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Source-backed confirmed deletion" />                    | Exact single-model DBT portable `.segment.json`; native JSON-only API68/default retrieve, absent-target CREATE, bounded existing UPDATE and source-backed confirmed DELETE have installed acceptance. CREATE/UPDATE require processing acknowledgement; DELETE requires exact source agreement and explicit confirmation, with independent absence verification. Separate same-version DMO detail/Metadata reads validate dependencies, not a companion Segment XML file. Historical API65 XML-paired qualification remains separate. Later conservative DELETE processing-guard refinement is offline-qualified, not a newly installed build acceptance. No general cross-org, arbitrary SQL, completed computation, generated-resource or physical-cleanup claim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Segment members                            | Unavailable                                                                                                                                                                                                         | Unavailable                                                                                                                       | Unavailable                                                                                                                     | Unavailable                                                                                                                             | Bounded membership reads, not a full population export. Runtime rows are outside plugin configuration scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Data Graphs, `data-graph`                  | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                                                                                                               | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native API68 creation" />                         | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                           | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native API68 guarded definition deletion" />            | Plugin: native API68 (default space) retrieve, create, update and delete of any root, related objects, field types and schedule; auto and 68.0 select it; other versions are refused. Update sends the authored change in one PUT; name, data space, root and node identity changes are refused. Delete requires known-empty dependencies; exhaustive external consumers and generated-resource/storage/credit cleanup unverified. Deploy runs graphs as the last phase of any selection, explicit or `--changed-since`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Identity Resolution, `identity-resolution` | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                                                                                                               | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native API68 ruleset creation" />                 | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                           | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native API68 acknowledged-processing owner deletion" /> | Plugin: native API68/default retrieve, create (POST), full-settings PATCH and delete of any ruleset the API accepts (any configuration, automatic run on or off, any rules); refused only: configuration type or secondary DMO changes, a new name that does not match its type, writes while PUBLISHING or DELETING. Processing acknowledgement required; bounded asynchronous settlement and conservative unknown outcomes. Delete returns acknowledged-processing until Salesforce finishes. No explicit computation or physical-cleanup guarantee.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Kit templates                              | Unavailable                                                                                                                                                                                                         | Unavailable                                                                                                                       | Unavailable                                                                                                                     | Unavailable                                                                                                                             | Stored snapshots, not runtime Graph/IR creation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Kit definitions                            | Unavailable                                                                                                                                                                                                         | Unavailable                                                                                                                       | Unavailable                                                                                                                     | Unavailable                                                                                                                             | Combined owned container/template/member transport, not successful runtime installation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Kit membership                             | Unavailable                                                                                                                                                                                                         | Unavailable                                                                                                                       | Unavailable                                                                                                                     | Unavailable                                                                                                                             | Creation/deletion qualified only with its container/template, not independently.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

The scope notes summarize the [14-resource Salesforce CLI guide](https://sfmc.guide/next/data-cloud-cli/),
whose operation-specific evidence and prerequisites apply; it is **not an extra
plugin feature list**. Metadata-only definitions and API runtime operations are not
interchangeable. Raw API examples later in this README document separate research.

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

Current plugin limits:

- Native DLO, DMO and mapping retrieval supports omitted selectors (all implemented
  native families), bare types and exact members. Other families require exact
  members. Native DLO/DMO/mapping accept explicit nondefault data-space scope;
  this is parameter plumbing, not live nondefault lifecycle qualification. Legacy
  families and dependency adapters remain default-only. Default/`auto` uses API68 for native routes;
  explicit numeric pins are preserved, not silently upgraded. Numeric admission
  (61.0 and above for native retrieval/deploy) is not live qualification at every
  version; native mapping pair removal and whole-mapping deletion are admitted at the
  same versions. Legacy routes remain family-specific
  (API65 legacy families), not the latest API. No family uses the API 67 tool layer.
  Public IR retrieval/deployment uses native API68 for default/`auto` or explicit `68.0`.
  `--api-version latest` is not accepted.
- DMOs have one route, the native one, with the artifact
  `data360/dmo/<ApiName>__dlm.dmo-meta.json`. The plugin applies no local allowlist for
  category, field data types, label length, descriptions or extra keys; Salesforce
  decides and its error is reported. The plugin refuses, before any write, what
  the native DMO API cannot do (changing an existing field's data type, moving the
  primary key, removing a field) and any write to a platform-generated DMO. A
  standard DMO takes writes to its custom fields, its object label and its object
  description only. Custom fields are removed only with `--allow-field-removal`,
  through a Metadata API destructive change.
  The documented API behaviour is observed at API68 on empty custom DMOs and on one
  standard DMO in the default data space only; see
  [Public DMO workflow](#public-dmo-workflow). Data-bearing DMOs, standard DMOs in
  active use, non-default data spaces, other API versions, relationships and SQL/flex
  DMOs are not verified.
- Native DLO/DMO creation and updates, mapping creation and qualified API68/default
  desired-state pair reconciliation, native API68 Segment DBT absent-target creation,
  label/description or qualified forward empty-audience predicate updates, CI predicate updates,
  native API68 IR full-settings create/update and Graph
  projection updates are separate bounded profiles. Explicit native batches settle DLOs, then
  DMOs, then mappings, then relationships. General DLO schema edits and unqualified mapping changes are not enabled.
  Native API68 IR and Graph create, update and delete send what the file describes;
  Salesforce decides.
  Use `--preview` before deployment.
- Installed revision `518a219` has bounded two-org existing-owner IR/Graph retrieval,
  target Graph LastName update, independent full preservation and actual zero-write
  repeated pair deployment evidence. The IR owners stayed unchanged: this does
  **not** qualify portable IR mutation, product CREATE or complete end-to-end migration.
  Broader family and released-package acceptance remain separate gates.
- Unknown mutation outcomes stop without automatic retry or rollback. Processing
  acknowledgements authorize only the selected supported change, not arbitrary runs.

## Main workflow: Data Stream, DMO, then mapping

A Data Stream brings source data into a landing Data Lake Object (DLO). A Data
Model Object (DMO) is the separate model that receives mapped fields. Use this order:

1. **Create the Data Stream.** It creates its landing DLO. The supported plugin
   create profile uses an existing Ingestion API connection and source event, with
   an empty `spec.additiveFieldMappings` array and a Text primary key. Do not create
   a standalone DLO first as a substitute for the stream's landing DLO.
2. **Create or prepare the DMO and its required fields.** This is independent of
   step 1: either step can run first, or they can be prepared in parallel. A stream
   does not create the DMO or its fields.
3. **Create the DLO-to-DMO mapping last.** Both objects and the compatible fields
   being mapped must already exist. Check the actual landing DLO name after stream
   creation; generated target names need not match the proposed names.

Salesforce ignores the authored name of a new Ingestion API stream: it names the
stream `<connection>_<event>_<8 hex>` and the landing DLO after it. Deploy reports
that name as `targetApiName`. Retrieve the stream by that name and keep the
retrieved file; deploying the authored file again is blocked because the name no
longer matches.

One deploy can carry all three steps: streams run first, then the native DLO →
DMO → mapping order (see [Dependencies and Git selection](#dependencies-and-git-selection)).
A mapping onto the landing DLO of a stream that does not exist yet still needs the
landing DLO name Salesforce gives it, so for a new stream deploy the stream first and
map its reported DLO in a second run. Do not add a DLO file named like the landing
DLO of a stream the deploy creates: the new stream owns that DLO, and deploy refuses
the pair after the stream's read-only comparison and before any write
(`DATA_STREAM_DLO_COLLISION`). The DLO file of an existing stream deploys beside it. For the exact DMO and mapping document
contracts, see [Public DMO workflow](#public-dmo-workflow) and
[DLO-to-DMO mapping](#dlo-to-dmo-mapping-native-definition-crud).

### Add a landing DLO field through its owning stream

For a stream-linked DLO, use the owning Data Stream to make the supported schema
addition. Standalone [DLO definition CRUD](#native-dlo-definition-workflow) is not a
complete ingestion workflow and is not the route for this stream-owned change.

First retrieve the existing stream into your local project. Run the following
commands from that project's root; replace `ExampleStream` with its actual API name:

```sh
sf data360 retrieve -o target -m data-stream:ExampleStream --api-version auto -d . --json
```

The canonical file is
`data360/data-stream/ExampleStream.data-stream-meta.json`. Keep its strict document
shape, identity, connection, event, labels, primary key and read-only `observed`
content intact. Use the retrieved actual labels rather than assuming the original
creation proposal still matches the target.

**Modification example only, not a complete deployable document:** append this
entry to `spec.additiveFieldMappings`, retaining any existing entries:

```json
{
  "sourceFieldLabel": "ContactEmail",
  "targetFieldName": "ExtraContactEmail",
  "targetFieldReturntype": "Text"
}
```

This example requires an **already existing**, uniquely resolved, non-primary-key
Text field whose source-event label is `ContactEmail`. Replace it with the real
source label; it is not an instruction to add a source field. `ExtraContactEmail`
is a new ordinary Text landing-field name, supplied without `__c`; the persisted
DLO field is `ExtraContactEmail__c`. Do not use an existing source-field name, a
primary key or a generated/system field as the new target.

Preview the stream-only change, then explicitly allow processing to apply it:

```sh
sf data360 deploy -o target -m data-stream:ExampleStream --api-version auto --preview --json
sf data360 deploy -o target -m data-stream:ExampleStream --api-version auto --allow-processing --json
```

The stream PATCH maps that existing source field to the new landing field. It
**does not extend the source-event schema**, create DMO fields or create/update
downstream DLO-to-DMO mappings. Prepare any required compatible DMO field separately,
then deploy the downstream mapping as a separate final step. Removing entries from
`spec.additiveFieldMappings` does not remove existing target fields or mappings.
Label changes, primary-key changes, type changes, retargeting and destructive schema
reconciliation are outside this additive-only profile. An unchanged supported
stream needs no processing acknowledgement and makes no write.

### Scope and verification status

The native `data-stream:ApiName` retrieve/deploy/delete subset is implemented and covered
by synthetic plugin tests. It uses default/`auto` API 68 (or explicit `68.0`), the
**default data space**, one existing Ingestion API source event, `UPSERT`, category
`Other` and the qualified Text-field profile only. It is not general connector or
schema support. Streams deploy alone or as the first phase of a mixed deploy
(explicit or `--changed-since`); inventory retrieval is not supported.

Installed API68 qualification passed source create/retrieve, then target
create/retrieve after changing only `spec.connectionName` to an existing compatible
target connection. A target-retrieved document then passed one additive Text mapping
update and an unchanged repeat with no write. Explicit `--delete-dlo` cleanup passed
on both sides, with independent stream and linked-DLO absence checks and protected
resources unchanged. This qualifies only that bounded cross-org profile, not all
connectors, API versions, populated data, complete migration or a published release.
The earlier unexplained run is disregarded as qualification evidence; its cause is
not inferred from this fresh success.

For exact stream deletion, preview first. The default preserves the DLO;
`--delete-dlo` explicitly requests cascade removal of the linked DLO too. Fresh
identity, binding and dependency checks must pass, and completion is verified by
independent reads, not HTTP success alone. The stream DELETE (including the
`--delete-dlo` cascade request) is sent once on the same bound authenticated
connection as the reads: no child `sf api request rest`, no token refresh, no HTTP
retry, redirects refused. An expired session stops with HTTP 401; log in again and
rerun. The fresh cross-org run covered cascade
mode; it does not requalify preserve mode across orgs. `DataStreamDefinition`
Metadata XML examples below remain separate from this native JSON workflow.

### One delete across families

`sf data360 delete` takes any mix of families in one command and runs them in reverse
dependency order, one phase after the other:

1. data graphs;
2. Identity Resolution, calculated insights and Segments, each dependent before the
   component it needs (a graph, calculated insight or Segment on the unified or link DMO
   of a selected ruleset counts as its dependent);
3. data transforms;
4. relationships, mappings, DMOs, then DLOs;
5. data streams.

A phase starts only after every item of the previous one settled. A blocked, failed or
unconfirmed item stops the run. An item Salesforce accepted but is still deleting
(`deletion-processing`) stops the later phases with `DELETE_PHASE_NOT_SETTLED`; rerun the
same delete once it reads absent, and the items already gone report `unchanged`. Each
family keeps its own checks. Every result item carries `family`.

Components are selected by name only, with `-m`; a delete reads no local file. Before the
first delete, the current definition of each selected transform, Segment, Identity
Resolution, calculated insight and graph is read from the org by its name (read-only, also
with `--preview`), and the family checks compare against that definition. A component the
org does not have reports `unchanged` with mutation `not-attempted`. A data transform name
is resolved to its record ID through the complete transform list, ignoring letter case: no
match is `unchanged`, two or more are refused (`TRANSFORM_TARGET_NOT_RESOLVED`). A
relationship is named with its source DMO, `relationship:<SourceDmo__dlm>:<Name>`. A `-m`
delete runs without a confirmation flag: check it with `--preview` first.
`--confirm-delete` belongs to `--changed-since` only.

```sh
sf data360 delete -o target -m data-graph:ExampleGraph -m identity-resolution:Individual_5810 --preview
sf data360 delete -o target -m data-graph:ExampleGraph -m identity-resolution:Individual_5810
```

- `--preview` runs every phase read-only. An item whose selected dependents an earlier
  phase deletes (the ruleset above, whose unified DMO the graph uses) is reported
  `planned-dependencies` with `DEPENDENCIES_PLANNED` naming them, without being read.
- A stream selected together with its landing DLO is deleted once with `--delete-dlo`
  semantics; the DLO is never deleted on its own. Its item reports
  `removedWith: data-stream:<Name>` and the stream's outcome.
- A custom DMO selected together with its last mapping: only the DMO is deleted, which
  removes the mapping (observed at API68: deleting the DMO removes its last mapping, while
  Salesforce does not delete that mapping on its own). The mapping item reports
  `removedWith: dmo:<Name>` and the DMO's outcome; no separate request or read is made
  for it.

#### Delete what a Git range deleted

`--changed-since <ref>` deletes in the org the components whose canonical plugin files
were deleted since the merge base with `<ref>` (committed or staged; an unstaged deletion
blocks). Files changed or added in the range are not part of a delete. It is exclusive
with `-m` and always needs `--confirm-delete`, even for one family; `--preview` runs
without it.

```sh
sf data360 delete -o target --changed-since main --preview
sf data360 delete -o target --changed-since main --confirm-delete
```

- The deleted files run through the phases above. Identity and definition come from each
  file's merge-base content, not from its name, and each family keeps its checks; right before
  each phase every deleted path must still be absent (`BLOCKED_GIT_LIFECYCLE`).
- A path deleted and added again is not a delete. A rename, also one split across commit,
  index and worktree (one component deleted at one path and added at another), a conflict
  or a deleted file of no known family blocks before any org call
  (`BLOCKED_GIT_LIFECYCLE`).
- A relationship takes its source DMO from the base content. A data transform is found by
  its name in the org's transform list like a `-m` one: no match reports `unchanged`
  (also when the delete is run again after the transform was deleted), two or more are
  refused (`TRANSFORM_TARGET_NOT_RESOLVED`).
- A stream file deleted together with its landing DLO file is one stream delete with that
  DLO; a stream deleted alone keeps its DLO. `--delete-dlo` is refused here.
- No local file is listed or removed. A range without deleted plugin files succeeds
  without an org call.

### Local files after delete

After a confirmed deletion `sf data360 delete` removes the deleted component's local
file at its canonical path, found by name (no folder is searched): on outcome `deleted` (mutation `confirmed-deleted`) and on
`deletion-processing` (mutation `acknowledged-processing`: Salesforce accepted the
deletion and is finishing it). Pass `--keep-local-files` to keep the files.
The name in the file path and in the result is the org's spelling when the org matched
the selector ignoring case (`-m data-transform:copy` deletes `Copy` and removes
`Copy.dataTransform.json`); a component the org does not have keeps the selector's spelling.

| Family                                                                                 | File removed                                                                                                                     |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `dlo`, `dmo`, `relationship`, `data-stream`, `data-transform` | its file under `data360/` in the current directory (`data360/dataTransforms/<Name>.dataTransform.json` for a transform); with `--delete-dlo` (or its landing DLO selected) also the linked DLO's file |
| `mapping` | `data360/mapping/<Name>.mapping-meta.json`, or the hand-written mapping file whose binding matches |
| `segment`, `identity-resolution`, `data-graph`, `calculated-insight` | its canonical file under the default package directory of `sfdx-project.json` (`force-app/main/default` without one), for example `data360/segments/<Name>.segment.json`; both members of a calculated insight pair |

Files are removed one at a time and only when they are regular files: directories,
symbolic links, junctions, files reached through a linked folder and hard-linked
files are refused, and so is any path outside the project's `data360` folder or the
package directory. Each result item lists
`removedLocalFiles` with the outcome of every file: `removed`, `not-present`,
`kept` or `failed`. A failed removal keeps the confirmed org outcome; the command
then exits nonzero with `LOCAL_FILE_REMOVAL_FAILED`. Remove that file by hand; do
not repeat the delete.

Nothing is removed by `--preview`, which lists the files as `localFiles` with
`exists`, nor for the outcomes `unchanged`, `blocked`, `failed`, `rejected` and
`deletion-unconfirmed` or an `unknown` mutation. Mapping files of mappings that
Salesforce removes together with a deleted DMO stay, unless the mapping is an item of the
command (`removedWith` the DMO). Field-level delete (`--field`) removes no file; it refreshes
the DMO and mapping files.

```sh
sf data360 delete -o target -m mapping:ExampleMapping --preview --json
sf data360 delete -o target -m dlo:Example__dll --keep-local-files
```

### Safe operation diagnostics

Supported stream, DLO, DMO, mapping, identity-resolution, Data Graph, calculated
insight and Segment operations distinguish plugin verification failures from
confirmed Salesforce API rejections. A failed protected-state comparison can name
the check, resource and first differing path, with expected/observed values only
for bounded schema identifiers, enums and flags. IDs, labels, free text, unknown
properties and other sensitive comparison values are redacted.

For confirmed API failures, human-readable and JSON diagnostics can include the
real HTTP status, Salesforce error code, request ID and useful explanation admitted
from structured API error fields. Empty, generic, unrecognized or unsafe details
use an operation-specific fallback instead. Bounded, conservative filtering rejects
recognized sensitive echoes; it is not a universal guarantee that server prose is
free of personal information. Raw remote payloads, arbitrary exception messages
and stack traces are not forwarded. Without confirmed API evidence, the diagnostic
does not claim Salesforce rejected the request. These explanations do not weaken
safety checks, change public contracts or error codes, or authorize retrying an
unknown mutation.

Connect API failures report HTTP 429 **Too Many Requests** as rate limiting.
HTTP 503 **Service Unavailable** can indicate a Connect rate limit, maintenance,
load or another availability issue; the cause is not confirmed. Human-readable
and JSON diagnostics include a server `Retry-After` value only when it passes
validation. Reduce request frequency and try later; effective limits can vary
with load and change. Inspect the target before rerunning a write whose outcome
is unknown. The plugin does not automatically replay the write.

### Error codes

Every diagnostic carries a plugin error code such as `IDENTITY_RESOLUTION_NOT_SETTLED`.
Human output prints the code and message, then a short hint and a link to the code's
reference page:

```text
IDENTITY_RESOLUTION_NOT_SETTLED: <message, including Salesforce's own detail when there is one>
Hint: <what went wrong and what to do>
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v<version>/docs/errors/identity-resolution/IDENTITY_RESOLUTION_NOT_SETTLED.md
```

With `--json`, each diagnostic has the same `hint` and `docs` fields next to `code` and
`message`. The links point at the release tag of the installed version. The full list,
grouped by family, is in [docs/errors/README.md](docs/errors/README.md).

## Native DLO definition workflow

The DLO workflow uses native Data Cloud API 68 through authenticated
`sf api request rest`. This retains standard Salesforce CLI authentication; it does
not replace CLI auth with another credential store.

**Why not simply wrap `sf project retrieve/deploy`?** Standard Metadata retrieval
worked at requested APIs 65–68 and saved identical object/field XML. However,
redeploying the complete retrieved definition hit demonstrated primary-key and
key-qualifier failures. Separate native API 68 experiments completed standalone
create/read/update/delete, preserving the primary key and generating qualifier and
system fields. These observations do not mean Metadata APIs or standard CLI
retrieval are universally unsupported, nor do they qualify ingestion.

The plugin's concrete benefit over handcrafted API requests is one manifest-free
workflow: canonical `data360/dlo/<FullApiName>__dll.dlo-meta.json`, portable source-ID-free
JSON, distinct save/create/update field policies, and target-name lookup selecting
POST only on confirmed absence or PATCH for an existing target. Retrieved generated
fields remain in the saved definition; they are not blindly replayed on creation.
The replacement removes the former XML `dlo:` export and separate `ingestion-dlo:`
mechanism, not unrelated component types. Exact command contracts and bounded
acceptance results are documented in the DLO chapter below.

## Public Graph workflow

### Native API68 retrieve, create, update and delete

Retrieve (default/`auto` or `--api-version 68.0`) a graph in the default data space: any root
object (standard, such as `ssot__Individual__dlm`, or unified, such as
`UnifiedssotIndividualMkt__dlm`), its related objects with their join paths, all field
types and its refresh schedule. Retrieve writes
`force-app/main/default/data360/dataGraphs/ExampleGraph.native-dataGraph.json`
(or the configured source package), a `kind: native-data-graph`, `apiVersion: 68.0`
document. Retained bindings are matched to the target again; source-org record IDs do
not become target authority.

```sh
sf data360 retrieve -o source -m data-graph:ExampleGraph -d ./project --json
sf data360 deploy -o target --source-dir ./project/force-app/main/default/data360/dataGraphs/ExampleGraph.native-dataGraph.json --preview --json
sf data360 deploy -o target --source-dir ./project/force-app/main/default/data360/dataGraphs/ExampleGraph.native-dataGraph.json --allow-processing --json
sf data360 delete -o target -m data-graph:ExampleGraph --preview --json
sf data360 delete -o target -m data-graph:ExampleGraph --json
```

Retrieve, deploy and delete accept auto or API68; any other version is `INVALID_SCOPE`. A graph that does not exist is created from the
file as written (root, related objects, fields, schedule) and needs
`--allow-processing`. Salesforce adjusts what it stores: it adds the key-qualifier
field to related objects and can report a different node `type` (a unified root reads
`derived`), so retrieve after a create to get the stored form. On a unified (derived)
root Salesforce also renames the root object (devName and label) and its fields
(devNames); retrieve after the create and keep the retrieved file. Preview is read-only and,
because no API answer exists there, checks the root: a missing root DMO is
`DATA_GRAPH_ROOT_NOT_FOUND`; for a derived (unified) root it reads the IR rulesets and
reports `DATA_GRAPH_OWNER_NOT_FOUND`, `DATA_GRAPH_OWNER_NOT_PUBLISHED`, or the owning
ruleset as `DATA_GRAPH_OWNER`. Deploy itself does not check the owner; Salesforce
decides.
Deploy takes any number of graphs, alone or beside other families (also through
`--changed-since`); graphs run last. Retrieve takes one graph per command; cascade is
not available.

For an existing graph, edit the retrieved file, preview, then deploy with
`--allow-processing`. The change goes to Salesforce in one PUT and Salesforce decides:
label, description, refresh schedule, incremental refresh, added fields and related
objects, joins and field settings are sent as written. The plugin refuses only changes
to the graph name, data space, root object and a node's object, path or type, because
they identify what is being changed. Leaving fields or branches out of the file keeps
them; it is not a removal request.

Native deploy accepts `--wait-timeout <positive integer seconds>`, default `1800`,
covering readiness, the write and settlement within one invocation budget for each
selected graph; it is refused when the selection holds no graph. GET
retry/poll waits are at least 20 seconds, subject to the remaining deadline.
Executing an existing-target workflow warns upfront on stderr: processing can take
seconds to many minutes, up to 30 minutes depending on objects, fields, data volume
and service load. This is not a completion guarantee. Retry progress stays on
stderr in human and JSON modes; optional `--json` produces clean structured stdout.
Before its guarded PUT, UPDATE independently requires item `ready`, metadata
`Ready` and the exact DataGraph record's `READY` / `ACTIVE` state and target binding.
Independent post-write readiness and full preservation, not the response echo,
establish `updated` / `confirmed-updated`. An identical ready definition returns
zero-write `unchanged` without processing acknowledgement. A graph write (create
POST, update PUT, DELETE) answered HTTP 429 or 503 was not processed: the plugin waits
(Retry-After seconds when Salesforce sends them, otherwise 20 seconds, with a stderr
line) and sends the same write again until the command's wait budget ends; then the item
is `failed` / `not-attempted`. Timeouts and other uncertain outcomes are not resent.

CREATE waits while Salesforce builds the new graph, up to `--wait-timeout` (default
1800 seconds), with progress on stderr; the create POST is resent only after a 429 or 503 answer. The graph first
reads `creating` with empty generated names, briefly `processing`, then `ready` before its generated day-zero
DMO, mapping and transform names exist, and its metadata stays `Inprogress` for about 5
minutes, sometimes briefly missing from the metadata list. Creating a three-field graph
took about 7 minutes, one with a related object about 17 minutes. When a check after the request cannot confirm the graph, the item
reports `failed` with mutation `unknown` and `DATA_GRAPH_CREATE_UNCONFIRMED`, naming
the step (`request`, `response`, `settlement`, `identity` or `deadline` when `--wait-timeout` ran out). The graph may exist:
read it with retrieve, or deploy the same file again (`unchanged` once the graph is
built), instead of creating it again.

November 5 qualification separately verified native API label, description,
additive-field, child and multihop changes. Installed public CLI acceptance made
one description-only PUT and independently confirmed full recursive preservation;
subsequent JSON/human repeats were unchanged with zero writes. A final fresh archive
verified stderr warning and clean JSON output using zero-write checks, not another
PUT. These bounded results do not establish general cross-org portability.

Delete takes the exact selector; the graph's definition is read from the org by name
(a graph the org does not have is `unchanged`: the item read must say not found, the
metadata read must say not found, and neither the graph list nor SOQL may hold the name;
when any of them still holds it the delete stops before any deletion). Fresh ready state, org/identity/created-date, full definition,
root and explicitly empty known native dependency/related-segment arrays are
rechecked before deletion. Unknown or nonempty dependencies block; **exhaustive
external-consumer exclusion remains unverified**. Independent definition absence
was confirmed after live API68 create/read/delete qualification. The DELETE's
answer decides: 2xx is `deleted` / `confirmed-deleted`, an API 4xx is `failed` /
`rejected` with Salesforce's error, a 429 or 503 that never gets through within the
budget is `failed` / `not-attempted`, and any other 5xx or a transport failure is
`failed` / `unknown`. Nothing is read back afterwards: the by-name metadata read keeps
returning a stale copy of a deleted graph for minutes. The DELETE is resent only after a
429 or 503 answer, within the 120-second delete budget.
Generated DMOs, mappings, transforms, internal state, storage and credits cleanup
are not proven, nor is successful computation. Earlier installed-package CRD smoke
covered command routing with offline seams; the separate installed UPDATE evidence
above does not establish a complete live cross-org lifecycle. GUI UPDATE alone is
not native REST or plugin qualification.

## Public calculated insight workflow

Calculated insights use the native API 68 route for retrieve, deploy (including
`--draft`), publish and delete. Default/`auto` and explicit `--api-version 68.0`
select it; any other version, including `65.0`, is refused with `INVALID_SCOPE`.
Only the default data space is accepted. Standard XML, SOAP Metadata and DMO
prerequisite reads use their own fixed routes and are reported separately.

The artifact is a correlated XML/JSON pair; either member selects the full
component. For example, with a retrieved pair in `./ci-pair`:

```sh
sf data360 retrieve -o source -m calculated-insight:ExampleInsight__cio -d ./project --json
sf data360 deploy -o target --source-dir ./ci-pair --draft --preview --json
sf data360 deploy -o target --source-dir ./ci-pair --draft --allow-processing --json
sf data360 publish -o target --source-dir ./ci-pair --preview --json
sf data360 publish -o target --source-dir ./ci-pair --allow-processing --json
sf data360 delete -o target -m calculated-insight:ExampleInsight__cio --preview --json
sf data360 delete -o target -m calculated-insight:ExampleInsight__cio --json
```

### Retrieve

Retrieve exports one exact ACTIVE calculated insight, including one that has
already run and one whose schedule is `SYSTEM_MANAGED`; retrieval only reads. It
correlates the native definition, the Metadata API definition, target DMO field
bindings and the standard project XML before writing anything. A repeated
identical retrieve is unchanged; differing output needs `--overwrite`.

A calculated insight that the artifact cannot represent is refused, and the
error names the component and the reason:

- `CI_NOT_FOUND`: not present in the target org.
- `CI_NOT_ACTIVE`: draft, processing or deleting.
- `CI_RUNTIME_PROFILE_UNQUALIFIED`: packaged (`isFromPackage: true`), or carries
  schedule history, a query dialect, a schedule time zone or a source-CI link.
- `CI_EXPRESSION_UNQUALIFIED`, `CI_CONFIGURATION_UNQUALIFIED`,
  `CI_SCHEMA_UNQUALIFIED`: SQL, settings or dimensions/measures outside the
  artifact.
- `CI_ATTRIBUTION_UNQUALIFIED`: field attribution outside the artifact. The
  artifact holds only the qualified SQL expression shapes, so other expressions
  stop here; this is a limit of the format and remains open.
- `CI_METADATA_MISMATCH`, `CI_METADATA_AMBIGUOUS`: the native and Metadata API
  definitions disagree, or the Metadata definition is missing or ambiguous.

### Deploy, publish and delete

Writes admit only never-run calculated insights whose schedule is
`NOT_SCHEDULED`. Whether run or scheduled ones could be written safely has not been
tested either way; that remains open.

`--draft` is required to create an absent calculated insight and to edit a DRAFT
expression; it keeps DRAFT and never unpublishes an ACTIVE one. Creation needs the
native definition to read `ITEM_NOT_FOUND` and the Metadata definition to be absent;
a Metadata-only shell is not an absent target. Publication is a separate explicit
`NOT_SCHEDULED` operation; nothing is published or rescheduled automatically. ACTIVE
expression edits omit `--draft` and keep the publication state. Only the two
qualified same-aggregation false-predicate expressions (with or without the
DeviceId non-null predicate) are writable, not arbitrary SQL, labels or schema
changes. Writes require `--allow-processing`; preview never writes.

Before writing, execute, publish and delete compare the authored document, the
status, the native profile and the Metadata definition. They do not compare the
attribution and runtime fields that the API 68 read varies between consecutive reads
(for example `dimensions[0]` and `measures[0].dataSource.sourceApiName`), so an
unchanged repeat returns `unchanged` and a matching already-ACTIVE publish is
unchanged too.

Delete takes the exact selector. The calculated insight is read from the org by name
with the exact native and Metadata read, so a DRAFT one is deletable as well as an
ACTIVE one; one the org does not have is `unchanged`. Content and dependencies are
checked fresh. This binds configuration; it does not prove who created it. It never
cascades. After a confirmed deletion it removes both members of the local pair at their
canonical paths (see [Local files after delete](#local-files-after-delete)).
A repeated delete after confirmed absence
is unchanged without confirmation. Each write is sent once; settlement (at most 12
native reads one second apart, 120-second outer deadline) needs independent native
and Metadata reads, not the response. An unknown outcome stops without retry or
rollback: reconcile by reading, do not resend the DELETE.

### Live verification

On `isolated-source` (2026-11-12), all at `auto`: retrieving two existing calculated
insights that had already run exited 0; a fixture calculated insight was created,
published, deployed unchanged three times and deleted, all exit 0. Earlier
installed cross-org runs covered create, publish, byte-identical retrieval of both
pair members and an ACTIVE expression edit. ACTIVE is not proof of a calculation;
no run, ingestion, populated data, storage/credit cleanup or released-package
behaviour is claimed. The operational examples later in this README describe
separate API research, not additional plugin capabilities.

## Public DMO workflow

`sf data360 retrieve`, `deploy` and `delete` handle Data Model Objects (DMOs) through
one route, the native DMO API. Default/`auto` uses API `68.0`; explicit numeric pins
from `61.0` are kept as given, and `--api-version latest` is not accepted. Each DMO is
one file, `data360/dmo/<ApiName>__dlm.dmo-meta.json`, beneath the project root. This
is not a general migration tool; the observed scope is listed below.

```sh
sf data360 retrieve -o source -m dmo:Example__dlm -d ./project --json
sf data360 deploy -o target -m dmo:Example__dlm --preview --json
sf data360 deploy -o target -m dmo:Example__dlm --json
sf data360 deploy -o target -m dmo:Example__dlm --allow-field-removal --preview --json
sf data360 delete -o target -m dmo:Example__dlm --preview --json
```

`-m/--metadata` is repeatable/non-greedy: exact `dmo:ApiName__dlm` selectors coalesce
and sort without an inventory request. `-m dmo` retrieves all DMOs in the selected
space using complete inventory; omitting selectors retrieves all implemented
native families (DLO, DMO and mapping). There is no `--all` flag. Mixed type/exact
selections coalesce. Empty inventory succeeds with no files. A failed object is not
silently skipped: diagnostics identify each object and its error code, successful
file receipts are retained, and the aggregate exits nonzero. `-o/--target-org`
overrides the configured default org. `-d/--output-dir` is a project root, default
cwd; a relative path is resolved against the current directory for every family.
`-x/--overwrite` permits replacing a differing file; identical bytes are
unchanged. Deploy and delete require exact selectors or explicit files; there is no
bare-type or deploy-all write selection.

`--json` uses Salesforce CLI's normal outer result wrapper containing a versioned
`sf-data360-retrieve` (or `sf-data360-deploy`) envelope with status, metadata,
diagnostics, provenance and result. Both commands resolve `metadata.plugin.version`
and `provenance.pluginVersion` from this plugin's own package metadata, not the host
Salesforce CLI version. Blocked/failed work exits 1, success exits 0. Parser/auth
flag failures use core CLI diagnostics.

### What the plugin checks and what Salesforce decides

The plugin checks only the shape of the file: `schemaVersion`, `kind`, `identity`
(API name ending `__dlm`, data space) and `spec` with a label, a category, an
optional description and at least one field. Each field needs a unique name ending
`__c`, a label, a `dataType` and a boolean `isPrimaryKey`; runtime keys such as `id`
or `status` are rejected. There is no local allowlist beyond that. Category, field
data types, label length, object and field descriptions and any extra keys are sent
as authored. Salesforce decides, and its error is reported.

Before a write to an existing DMO the plugin reads it and decides from its
`creationType` what may be written:

| Target read                                                                                                                                                         | Deploy                                                                                                    | Delete                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `creationType` `Custom` and a name without a double underscore before `__dlm`                                                                                       | Everything described under [Create and update](#create-and-update).                                       | Whole DMO and single fields.                                |
| `creationType` `Standard` (for example `ssot__Brand__dlm`)                                                                                                          | Custom fields (add, edit, remove), object label, object description. See [Standard DMOs](#standard-dmos). | Single custom fields only; the DMO itself is never deleted. |
| Any other `creationType` (platform-generated, for example `Adg`, `Bridge`, `Derived`, `Segment_Membership`), no `creationType`, or `Custom` under a namespaced name | Refused, `UNSUPPORTED_DMO_TARGET`.                                                                        | Refused, `UNSUPPORTED_DMO_TARGET`.                          |

Retrieve reads all of them.

### Observed API behaviour

Observed at API 68 on empty, unmapped custom DMOs in the default data space:

- **Routes.** Native DMO POST returns 201, GET 200, PATCH 200 and DELETE 204 at
  API 61 through 68; API 60 returns 404. A PATCH response shows the state before
  the change.
- **Categories.** Create accepts only `Profile`, `Engagement` and `Other`.
  `Segment_Membership` is internal-only and the other ten schema values are
  rejected. Input spelling is case-insensitive; reads return upper case; the plugin
  saves `Profile`, `Engagement` or `Other`.
- **Engagement.** No event date key is needed; `eventDateTimeFieldName` is rejected
  as unknown input.
- **Field data types.** Ten types work: `Number`, `Text`, `Date`, `DateTime`, `Url`,
  `Phone`, `Email`, `Percent`, `Boolean`, `Currency`. `ArrayOfFloats` and
  `ArrayOfTexts` are rejected by the API. A `Currency` field adds a generated system
  field `cdp_sys_record_currency__c`.
- **Limits set by Salesforce.** Object and field labels are limited to 40
  characters. Exactly one primary key is required; it can have any accepted type.
  Salesforce generates the key qualifier (`KQ_<key>__c`, referenced by
  `keyQualifierName`) and rejects input keys outside its schema.
- **Descriptions.** The object `description` round-trips. Field `description` and
  `isDynamicLookup` are accepted but never returned by reads. A field description
  sent this way does not appear in the Data Model UI either, so treat it as not
  stored. The plugin sends both keys when a field is created or otherwise edited,
  but cannot detect or confirm a change to them alone.
- **Read-only keys.** `creationType`, `isDistinct`, `usageTag` and `keyQualifierName`
  are returned by reads only. They are kept in retrieved files and never sent.

### Create and update

Deploy looks up the exact target name. A confirmed HTTP 404 leads to a create; any
other lookup failure stops. An existing target is compared and, if different,
updated with one PATCH. An update can:

- change the object label;
- set or clear the object description. An absent `spec.description` means "not
  managed" and leaves the target value as is; an explicit empty string clears it;
- change the labels of existing fields;
- add fields of any accepted type.

A changed category is sent, and Salesforce rejects it ("Data Object Category cannot
be updated"). A definition may omit generated and system fields; they are never
removed.

#### Standard DMOs

A standard DMO (`creationType` `Standard`, for example `ssot__Brand__dlm`) is never
created and never deleted. Deploy on an existing one writes only:

- custom fields: add, change the label, and remove with `--allow-field-removal`. The
  rules are the same as on a custom DMO: generated fields are never removed, a mapped
  field is removed only together with every mapping file that drops its pair, and the
  removal runs after the PATCH;
- the object label. The PATCH carries `label` only when it differs from the target;
- the object description, with the same rule: absent means "not managed", an empty
  string clears it.

A PATCH that only adds one custom field has the body
`{"fields":[{"name":"<Name>","label":"<Label>","dataType":"Text","isPrimaryKey":false}]}`,
and a label change alone sends `{"label":"<Label>"}`. `dataSpaceName` is added when
`--dataspace` is passed.

Standard and system fields (field `creationType` other than `Custom`), including
the standard primary key, are never sent and never removed:

- they may be left out of the file. A file that lists only the custom fields is
  valid;
- when the file lists one, it must equal the target in every comparable property.
  A difference is refused with `UNSUPPORTED_DMO_FIELD_CHANGE`, naming the field and
  the property; Salesforce rejects such an edit ("Data model fields cannot start with
  ssot__");
- `isMapped` and `keyQualifierName` are not compared on these fields, and keys that
  reads do not return (`description`, `isDynamicLookup`) cannot be compared.

A field of the file that does not exist in the target is added only when it is a
plain custom field: a name without a double underscore before `__c` and no
`creationType` other than `Custom`. Anything else, for example `ssot__New__c`, is
refused with `UNSUPPORTED_DMO_FIELD_ADDITION`.

The category of a standard DMO is ignored: it is neither sent nor compared nor
required at readback. Salesforce changes it itself. Mapping a standard DMO for the
first time changes its category from `UNASSIGNED` to `OTHER`, enables the object,
adds the system field `KQ_Id__c` and sets `keyQualifierName` on the standard primary
key. None of these differences leads to a write or a refusal, so a retrieved
standard DMO file deploys back as `unchanged`, also to another org where the same
standard DMO is not mapped yet. Readback after a write confirms the label, a managed
description, the custom fields of the file and the absence of removed fields.

A standard DMO is a mapping target like a custom one; see
[Standard DMO as mapping target](#standard-dmo-as-mapping-target). A mapped custom
field of a standard DMO is removed with the single deploy command below or with
`sf data360 delete --field`.

Observed at API 68 through the plugin on one standard DMO in two orgs, active in only
one of them: adding and relabelling a custom field, removing it with
`--allow-field-removal` and with `delete --field` (local file refreshed), setting
and clearing the object description, the refusal of a changed standard field, the
refusal of a whole-object delete, and a file retrieved in one org deploying
`unchanged` to the other. Changing and reverting the object label and Salesforce's
own rejection of a standard field edit are observed on one standard DMO. See
[Not qualified and known limits](#not-qualified-and-known-limits) for what is not
tested.

Omitting a custom field that exists in the target counts as a removal. The native
DMO API has no route for it, so the deploy is refused unless `--allow-field-removal`
is set. With the flag:

- every custom target field missing from the file is removed with one Metadata API
  destructive change (`sf project deploy start --metadata-dir` with an empty
  `package.xml` and a `destructiveChanges.xml` listing `CustomField` members
  `<ObjectName>__dlm.<FieldName>__c`). The manifest version is the native API
  version in use;
- the PATCH for label, description and field edits or additions runs first. It is
  skipped when removals are the only change;
- a mapped field is removed with the same single destructive change. Salesforce
  drops the field's mapping pairs itself and leaves every other pair, the mappings'
  ACTIVE status and the rest of the DMO as they are. The removal is admitted only when
  the same command selects every mapping that holds a pair for the field, each with a
  file that omits that pair:

  ```sh
  sf data360 deploy -o target -m mapping:<MappingApiName> -m dmo:Example__dlm --allow-field-removal
  ```

  Before the DMO's first write the plugin runs the same read-only check (fields
  present, mappings ACTIVE, every pair on a removed field covered by a selected
  mapping file); a removal that would be refused stops the item as
  `blocked`/`not-attempted` with nothing written. The DMO then deploys in its normal
  position (data lake objects, DMOs, mappings): its PATCH, then the destructive change. When a PATCH was sent, the plugin waits until
  it is readable before the removal. Right before the destructive change it reads the
  DMO and all of its mappings again; if a pair for a removed field is then held by a
  mapping that is not selected with a file, or targets a field the admission did not
  cover, the DMO item stops with `DMO_FIELD_REMOVAL_MAPPED` before the destructive
  change (an earlier PATCH stays in place). The selected mapping files deploy
  afterwards and find the pairs already gone; a file whose only change was dropping
  them reports `unchanged`;

- after the destructive change the plugin polls reads (up to 6, 5 seconds apart)
  until the fields are absent and every mapping equals its earlier state minus
  exactly the removed fields' pairs, with status ACTIVE. Any other change (another
  pair, field, DMO property, mapping or status) stops with
  `DMO_FIELD_REMOVAL_SIDE_EFFECT`;
- the primary key is never removed: a file without the target's primary-key field is
  refused with `UNSUPPORTED_DMO_FIELD_CHANGE`;
- `--preview` lists the planned removals in `removeFields` and in a
  `DMO_FIELD_REMOVAL_PLANNED` diagnostic, and writes nothing. For a mapped field the
  diagnostic says that Salesforce drops its pairs together with the field, so the
  selected mapping files find them already gone. An executed item lists the removed
  fields in `removedFields` and the pairs Salesforce dropped in `droppedPairs`
  (`mapping`, `sourceFieldDeveloperName`, `targetFieldDeveloperName`);
- if Salesforce does not report every field as deleted, the item fails with
  `DMO_FIELD_REMOVAL_FAILED` and the reported problem text. Nothing is retried, and
  an earlier PATCH is not rolled back.

The flag affects native DMO inputs only. Removing a field deletes it and its values
in Salesforce; the file is the only record of what is kept.

After a write the plugin polls reads (up to 6, 5 seconds apart) until the requested
definition is confirmed and every removed field is absent. A write is never
repeated. If the reads do not confirm it, the command fails with
`DMO_PERSISTENCE_UNCONFIRMED` (a removed field still readable) or
`MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED` (a dropped pair still listed); inspect the
target before another attempt. `--preview` performs reads only.

### Refused before any write

| Situation                                                                                                                                                                                                                                                                                                                                                                                                         | Code                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Changing an existing field's data type or moving the primary key. The API answers 200 and silently ignores it.                                                                                                                                                                                                                                                                                                    | `UNSUPPORTED_DMO_FIELD_CHANGE`   |
| Omitting a custom field that exists in the target, without `--allow-field-removal`. The native DMO API has no route to remove a field; the flag removes it with a Metadata API destructive change for `CustomField`.                                                                                                                                                                                              | `UNSUPPORTED_DMO_FIELD_CHANGE`   |
| Omitting the target's primary-key field, with or without `--allow-field-removal`. The primary key is never removed.                                                                                                                                                                                                                                                                                               | `UNSUPPORTED_DMO_FIELD_CHANGE`   |
| Removing a field that is currently mapped, with `--allow-field-removal`, unless every mapping holding its pair is part of the same selection and its file omits the pair. Salesforce would drop the mapping pair together with the field. The whole batch is refused before its first write. The message names every mapped field, the mappings that hold its pair, the file edits and the single command to run. | `DMO_FIELD_REMOVAL_MAPPED`       |
| Adding a generated field or a second primary key.                                                                                                                                                                                                                                                                                                                                                                 | `UNSUPPORTED_DMO_FIELD_ADDITION` |
| On a standard DMO: a standard or system field of the file that differs from the target in a comparable property. The message names the field and the property.                                                                                                                                                                                                                                                    | `UNSUPPORTED_DMO_FIELD_CHANGE`   |
| On a standard DMO: a new field that is not a plain custom field (a namespaced name such as `ssot__New__c`, or a `creationType` other than `Custom`).                                                                                                                                                                                                                                                              | `UNSUPPORTED_DMO_FIELD_ADDITION` |
| Deploy, delete, delete preview or field-level delete of a platform-generated DMO (`creationType` neither `Custom` nor `Standard`), of a DMO whose read has no `creationType`, or of a custom DMO under a namespaced name. Creating a DMO with a namespaced name. Retrieving these DMOs is allowed.                                                                                                                | `UNSUPPORTED_DMO_TARGET`         |
| Deleting a standard DMO, or previewing that delete. Field-level delete of its custom fields is allowed.                                                                                                                                                                                                                                                                                                           | `UNSUPPORTED_DMO_TARGET`         |
| Deploying a mapping whose target is neither a custom nor a standard DMO: a platform-generated DMO, a read without `creationType`, or a custom DMO under a namespaced name.                                                                                                                                                                                                                                        | `MAPPING_TARGET_UNSUPPORTED`     |

### Delete

Delete addresses the exact name only. It has no dependency preflight and no prompt;
`--preview` is read-only. Salesforce may cascade the deletion to the DMO's mapping.
See [Native plugin workflow](#native-plugin-workflow) for the confirmation states.
Deleting a whole DMO needs no local file; after a confirmed deletion it removes
`data360/dmo/<Name__dlm>.dmo-meta.json` (see
[Local files after delete](#local-files-after-delete)). Only custom DMOs are
deleted: a standard or platform-generated DMO is refused with
`UNSUPPORTED_DMO_TARGET`, in the preview as well.

#### Delete single fields

```sh
sf data360 delete -o target -m dmo:Example__dlm --field Note__c --field Extra__c --output-dir ./project --preview --json
sf data360 delete -o target -m dmo:Example__dlm --field Note__c
```

`--field` removes the named custom fields from one DMO, together with the mapping
pairs that target them, and refreshes the project files. It is the one delete operation
that rewrites project files (it removes none), and it changes mappings that the command line does not
name. Check it with `--preview` first, which writes nothing, neither in the org nor on
disk.

- Selection: exactly one `-m dmo:<Name__dlm>` and one or more `--field <Name__c>`
  (repeatable; a repeated name counts once). Another selector, several selectors,
  `--changed-since` or `--delete-dlo` beside `--field`, and `--output-dir` without
  `--field`, are refused with `INVALID_FIELD_DELETE_SELECTION` before any org call.
- Admission, reads only: the DMO must be a custom or a standard DMO
  (`UNSUPPORTED_DMO_TARGET` for platform-generated DMOs and for custom DMOs under a
  namespaced name). Every named field must exist (`DMO_FIELD_NOT_FOUND`) and be a
  custom field that is neither the primary key nor generated
  (`UNSUPPORTED_DMO_FIELD_CHANGE`). On a standard DMO the field must be marked
  `creationType` `Custom`; its standard and system fields are never removed. The plugin
  then lists the mappings that target the DMO and collects every pair whose
  `targetFieldDeveloperName` is a named field. A field that shows as mapped while
  the mapping list fails, or while no listed mapping holds a pair for it, is refused
  with `DMO_FIELD_REMOVAL_MAPPED`. Every collected pair must belong to an ACTIVE
  mapping (`MAPPING_TARGET_NOT_SETTLED` otherwise) whose detail read equals its list
  entry (`MAPPING_INVENTORY_UNCONFIRMED` otherwise). Generated, key-qualifier and primary-key pairs are never selected,
  because the named field is none of these.
- Write: one Metadata API destructive change for all named fields, sent once and
  never retried. Salesforce drops the collected pairs together with the fields; the
  plugin sends no request per pair. Right before it the plugin reads the DMO and all
  of its mappings again; when the pairs are no longer exactly the planned ones, the
  command stops with `MAPPING_UNMAP_PLAN_CHANGED` and writes nothing.
- Confirmation: polled reads (up to 6, 5 seconds apart) until the fields are absent
  and every mapping equals its earlier state minus exactly the collected pairs, with
  status ACTIVE. Any other change (another pair, field, DMO property, mapping or
  status) stops with `DMO_FIELD_REMOVAL_SIDE_EFFECT`. When the reads do not settle in
  time, the command stops with `DMO_PERSISTENCE_UNCONFIRMED` (a field still readable)
  or `MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED` (a pair still listed).
- Nothing is rolled back. A stop before the write is `blocked` with mutation
  `not-attempted`; a sent destructive change without a confirmed result is `failed`
  with mutation `unknown`; a stop during the readback is `deletion-unconfirmed` with
  mutation `acknowledged`. The diagnostic names the step. No file is refreshed after
  a stop.
- Local refresh, only after the org steps succeeded:
  `data360/dmo/<Name__dlm>.dmo-meta.json` and
  `data360/mapping/<MappingApiName>.mapping-meta.json` of every mapping that lost a
  pair are read again from the org and overwritten under `--output-dir` (default:
  the current directory). A mapping file named differently, as a hand-written file
  usually is, is found by its binding (same source DLO, target DMO and data space)
  and keeps its own name. A file that does not exist is not created and is reported
  as `not-present`. No file is ever deleted. When a refresh fails, the item keeps
  outcome `deleted`, the file is reported as `failed`, and the command reports
  `LOCAL_REFRESH_FAILED` and exits nonzero. Refresh that file with
  `sf data360 retrieve --overwrite`; do not repeat the delete.
- Result: one item with operation `delete-field`, `fields`, `removedFields`,
  `unmappedPairs` (the pairs Salesforce dropped: `mapping`,
  `sourceFieldDeveloperName`, `targetFieldDeveloperName`) and `refreshedFiles`
  (`path` and outcome `refreshed`, `unchanged`, `not-present` or `failed`). Human
  output prints `dropped pair <Source> -> <Target> in mapping <MappingApiName>` per
  pair. A preview item has operation `preview`, a `plan` with one `unmap` step per
  pair that Salesforce drops with the field and one `delete-field` step per field,
  and `localFiles` (`path`, `exists`); its human output prints
  `Planned pair drop (Salesforce removes it with the field): ...` per pair.
- A repeat after success finds no such field and is refused with
  `DMO_FIELD_NOT_FOUND` without a write.

### Dependencies and Git selection

Retrieve and deploy act on exactly the selected components. What a component depends
on is checked, not pulled in: a prerequisite must be selected explicitly or already
exist in the target, and a missing or incompatible one blocks with its diagnostic.

- Deploy runs a selection in phases and starts a phase only after every item of the
  previous one settled; a blocked, failed or unknown item stops the run. Phase 0 holds
  data streams; phase 1 DLOs, DMOs, mappings and relationships; phase 2 the data
  transform; phase 3 Identity Resolution, calculated insights and Segments; phase 4 data
  graphs. A selection with a mapping, relationship or data transform runs phase 1 on the
  native route (DLO, DMO, mapping, relationship, each parent settled before its
  dependents), so any mix of families can be deployed in one command.
- A deploy takes at most one data transform, named exactly (`-m data-transform:<Name>`
  or its `.dataTransform.json` file, never through a directory), because
  `--transform-operation` and `--transform-target-id` address one transform
  (`INVALID_TRANSFORM_SELECTION`).
- A DLO file named like the landing DLO of a stream the deploy creates is refused
  after that stream's read-only comparison and before any write
  (`DATA_STREAM_DLO_COLLISION`); the new stream creates and owns that DLO. Beside an
  existing stream the DLO file deploys in phase 1 and Salesforce decides.
- A native DLO or DMO selected beside Segment, calculated insight or Identity
  Resolution inputs only (explicitly or through Git) joins the ordered batch and is
  deployed before the components that depend on it.
- An Identity Resolution runs before a calculated insight, Segment or data graph that
  uses its unified or link DMO, and those start only after the ruleset reads
  `PUBLISHED`. The
  DMO names come from the ruleset file: ruleset `Individual_5810` with reconciliation
  DMO `ssot__Individual__dlm` produces `UnifiedssotIndividual5810__dlm` and
  `UnifiedLinkssotIndividual5810__dlm`. `--async` is refused when the selection holds
  such a dependent or a data graph on that DMO
  (`IDENTITY_RESOLUTION_ASYNC_DEPENDENTS`).
- Before the first write of an earlier phase, phase 3 inputs pass their local checks
  (version, data space, file shape, dependency identities and order), and the version,
  data space and transform flags of streams, transforms and graphs are checked; a
  failure blocks the whole run. Org reads (Git snapshot rebinding, prerequisites, target
  comparison) run in each phase, so a blocker found there follows the earlier writes,
  which stay reported.
- Preview runs every phase read-only, also after a phase reported a blocked item (the
  result stays blocked). An item whose parent an earlier phase creates is
  reported as `planned-dependencies` (`DEPENDENCIES_PLANNED`, or
  `MAPPING_DEPENDENCIES_PLANNED` / `RELATIONSHIP_DEPENDENCIES_PLANNED` inside
  phase 1) instead of being compared: a mapping or transform on the landing DLO of a
  stream the preview creates, an item on a DLO or DMO phase 1 creates, and a graph on a
  DMO or ruleset output created earlier.
- On retrieve, a DMO selected beside other families is read on the native route at
  the native version (`auto` is 68.0); each other family keeps its own version rule,
  so `--api-version` must be one that every selected family accepts.

`--changed-since <ref>` is exclusive with `--metadata` and `--source-dir`. It selects
canonical files of every family from the unique Git merge base, staged/unstaged
changes and relevant untracked files, and resolves the repository root even from
nested directories. The selection runs in the same phases as an explicit one; a data
transform changed in the range is refused because `--transform-operation` is not
accepted with `--changed-since`. A file
deleted in the range becomes a delete candidate identified from its merge-base
content; deploy lists it in `result.selection.deletions` and never deletes it, and
`sf data360 delete --changed-since <ref> --confirm-delete` deletes it in the org.
Renames (also one split across commit, index and worktree), conflicts, unstaged
deletions of plugin files and deleted files of no known family block; a relevant untracked
addition plus **any tracked worktree deletion** also blocks conservatively. Stage
intended changes to permit Git-inferred rename detection. A valid empty selection
succeeds without downstream target work, but existing parse-time core authentication
remains. See [Git workflow](docs/git-workflow.md) for the file list and limitations.

### Not qualified and known limits

Data-bearing DMOs, standard DMOs in active use, non-default data spaces, API versions
other than 68 for the behaviour listed above, relationships, SQL/flex DMOs and
released-package acceptance have not been verified.

- A change to only a field's `description` or `isDynamicLookup` is reported as
  `unchanged`: Salesforce does not return these values, so the plugin cannot detect
  the difference. They are sent when the field is created or otherwise edited. A
  field description is accepted without error but shows up neither in reads nor in
  the Data Model UI.
- `spec` must not contain `name`, `dataSpaceName` or runtime keys such as `id`; the
  object identity comes from `identity` only. Other extra `spec` keys are sent on
  create, and on update only when Salesforce returns the same key with another value.
- A new DMO whose name contains a double underscore before `__dlm` (a namespaced
  name) is refused with `UNSUPPORTED_DMO_TARGET` before any write.
- Standard DMOs: observed at API 68 through the plugin on one standard DMO in two
  orgs, active in only one of them (add and relabel a custom field; remove it with
  `--allow-field-removal` and with `delete --field`; object description set and
  cleared; a changed standard field refused; whole-object delete refused; a file
  retrieved in one org deploying unchanged to the other). Not tested: a category
  change on a standard DMO (the plugin ignores its category), standard DMOs in active
  use (data-bearing or referenced by other components) and anything on
  platform-generated DMOs (refused by the plugin). The removal of a mapped custom
  field of a standard DMO is covered by synthetic tests only.
- Mappings onto a standard DMO: observed at API 68 through the plugin on one standard
  DMO (`ssot__Brand__dlm`) in two orgs. Where the DMO was already active, a
  hand-written file with the two pairs `Id__c` to `ssot__Id__c` and `Name__c` to
  `ssot__Name__c` created the mapping together with its data lake object, Salesforce
  added the four generated pairs, and the mapping retrieved afterwards deploys back
  with no change. Where the DMO was not active, the mapping preview shows
  `MAPPING_ACTIVATES_STANDARD_DMO` and changes nothing, and the deploy creates the
  mapping (outcome created, with the same notice); the DMO then reads
  enabled with category `OTHER` and the generated field `KQ_Id__c`.
- Mapping files and existing mappings: a hand-written file with only the authored
  pairs creates a mapping and deploys onto the existing mapping as well. The pairs
  Salesforce generated (the three system pairs and the key qualifier pair) are taken
  from the org's copy and treated as part of the file, so such a file deploys back
  unchanged, can add pairs, and removes exactly the authored pairs it drops. The
  authored primary-key pair must stay in the file
  (`MAPPING_PROTECTED_PAIR_REQUIRED`). Retrieve writes exactly such a file: the
  authored pairs only.
- Data lake object files and existing data lake objects: a hand-written file may omit
  the fields Salesforce generated (`cdp_sys_SourceVersion__c`, `DataSource__c`,
  `DataSourceObject__c`, `InternalOrganization__c`, `cdp_sys_PartitionDate__c` on
  Engagement data lake objects and the key qualifier of the primary key, for example
  `KQ_Id__c`); they stay as they are. Any other omitted field is refused
  (`UNSUPPORTED_DLO_FIELD_CHANGE`).
- Hand-written files with authored fields and pairs only: observed at API 68 through
  the plugin in one org. A data lake object, a custom DMO and their mapping were
  created and deployed again unchanged: all three report `unchanged` and nothing is
  written. With one field added to the data lake object and to the DMO, and one pair
  added and one authored pair dropped in the mapping file, all three report
  `updated`; the mapping then holds the two kept authored pairs, the new pair, the
  key pair and the four generated pairs. A data lake object and a mapping onto the
  standard DMO `ssot__Brand__dlm` (pairs `Id__c` to `ssot__Id__c` and `Name__c` to
  `ssot__Name__c`) were created and deployed again: `unchanged`. See
  [Observed run times](#observed-run-times).
- A mapping deploy removes any authored pair that the file no longer lists; Salesforce
  decides whether the removal is accepted. This includes a pair onto a standard field
  of a standard DMO, a pair whose source and target names differ, and any data type.
  The generated pairs (three system pairs and the key qualifier) and the key pair
  (source primary key onto target primary key) are never removed. Observed at API 68:
  the pair `Name__c` to `ssot__Name__c` removed by deploying the retrieved mapping
  file without it; observed at API 64 and 61: a pair removed through the plugin.
- Mapping create and update send the pairs the file lists and let Salesforce decide:
  any data types (the preview adds the notice `MAPPING_FIELD_TYPES_DIFFER`, naming
  `Source (Type) -> Target (Type)`, when they differ), source and target names that
  differ, one source field onto several targets, and a target another mapping of the
  DMO also holds. Salesforce itself rejects a new mapping without a pair joining the
  two primary keys (HTTP 400 `MISSING_ARGUMENT`, reported as `MAPPING_HTTP_ERROR`).
  Observed through the plugin: a mapping with a Number pair, a renamed pair and one
  Number source onto a Number and a Text target was created; its preview reported
  `noop` with `MAPPING_FIELD_TYPES_DIFFER`, and a repeat deploy and a deploy of the
  retrieved file were both `unchanged`.
- A mapping is deleted as a whole, whatever pairs it holds, including pairs onto
  standard fields and mappings onto standard DMOs; see
  [Whole-mapping deletion](#whole-mapping-deletion). Observed at API 68: a non-last
  mapping of a custom DMO with two mappings (the other mapping and all 8 DMO fields
  unchanged), and the only mapping of `ssot__Brand__dlm` in two orgs, one of them
  still holding the pair onto `ssot__Name__c`.
- The last mapping of a custom DMO is not deleted
  (`MAPPING_LAST_MAPPING_DELETE_BLOCKED`, refused before any write). Salesforce does not delete it: its Metadata API answers with an internal
  error and its native DELETE with HTTP 500. Delete the DMO instead
  (`sf data360 delete --metadata dmo:<Dmo__dlm>`), which removes its mapping. The
  last mapping of a standard DMO is deleted normally; the DMO stays enabled with its
  generated `KQ_Id__c` field and no mapped fields.
- Field removal with `--allow-field-removal` uses a Metadata API destructive change
  for `CustomField`. It is observed at API 68 on empty custom DMOs in two orgs,
  including a removal combined with a label change and an unchanged cross-org deploy
  of the reduced definition. The primary key and generated fields are never removed.
- A mapped field is removed in one of three ways:
  1. Edit the files and deploy once. Remove the field from the DMO file and its pair
     from every mapping file that holds one, then run
     `sf data360 deploy -m mapping:<MappingApiName> -m dmo:<Dmo__dlm> --allow-field-removal`.
  2. Name the field.
     `sf data360 delete -m dmo:<Dmo__dlm> --field <Field__c>` removes
     the field with its pairs in the org and refreshes the existing files; see
     [Delete single fields](#delete-single-fields).
  3. Deploy twice: the mapping without the pair, then the DMO without the field with
     `--allow-field-removal`. The result is the same as with the single deploy.
- Salesforce removes a mapped field through the Metadata API without objection and
  drops exactly that field's pairs from every mapping that holds one. Observed at
  API 68, also with the field mapped by two mappings: every other pair keeps its
  selector, both mappings stay ACTIVE, and the DMO's properties and other fields are
  unchanged. The plugin relies on this and removes a mapped field with the one
  destructive change; it does not delete pairs one by one.
- A deploy never removes a mapped field that the selected files still map. Before the
  first write of an all-native selection the plugin reads the mappings that target
  the DMO (one read-only list request). The removal is admitted only when every
  mapping holding a pair for the field is reconciled by a selected mapping file (same
  source and target object) that keeps no pair for that field. Otherwise, and when
  the list request fails, the whole batch is refused with `DMO_FIELD_REMOVAL_MAPPED`
  and nothing is written. An unmapped field on a mapped DMO is removed normally. The
  refusal names every mapped field with the mappings holding its pair, and prints
  these steps with the real names, the target org as passed (`-o` is left out when
  none was passed) and `--dataspace` when one was passed:

  ```
  sf data360 retrieve -o <org> -m mapping:<MappingApiName> -m dmo:<Dmo__dlm> --overwrite
  ```

  In `data360/mapping/<MappingApiName>.mapping-meta.json` remove the pair whose
  `targetFieldDeveloperName` is the field and keep all other pairs, including the
  generated ones. In `data360/dmo/<Dmo__dlm>.dmo-meta.json` remove the field. Then:

  ```
  sf data360 deploy -o <org> -m mapping:<MappingApiName> -m dmo:<Dmo__dlm> --allow-field-removal
  ```

  With `--json` the diagnostic also carries
  `mappedFields: [{"field": "<Field__c>", "mappings": ["<MappingApiName>"]}]`. When the
  mapping cannot be read or no mapping lists the field, the refusal is unchanged, the
  message says that the mapping could not be identified and `mappings` is empty.

- A field that several mappings target is removed by selecting every one of them,
  each with a file without its pair. The DMO removes the field and Salesforce drops
  all of its pairs; the mapping files deploy afterwards and find them gone. The mixed
  route beside Segment, calculated insight, Data Graph or Identity Resolution inputs
  cannot contain mappings and refuses a mapped field.
- After the destructive change, a readback that finds any change beyond the removed
  fields and exactly their pairs stops the batch with
  `DMO_FIELD_REMOVAL_SIDE_EFFECT`. A readback that does not settle in time stops it
  with `DMO_PERSISTENCE_UNCONFIRMED` (a field still readable) or
  `MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED` (a pair still listed). The DMO item is then
  `failed` with mutation `unknown`; nothing is retried or rolled back, and the mapping
  items are not deployed.
- The single deploy is observed at API 68 on a custom DMO whose field is mapped by two
  mappings: one deploy of both mapping files (each without the pair) plus the DMO file
  (without the field) with `--allow-field-removal` removes the field, the DMO item
  lists the field in `removedFields` and both pairs in `droppedPairs`, both mappings
  stay ACTIVE with their other pairs, and a repeat reports `unchanged`.
- Field-level delete (`delete --field`) is observed at API 68 on a field mapped by two
  mappings of a custom DMO: one destructive change removes the field, Salesforce drops
  both pairs, the other pairs and both mappings stay as they were, and the project
  files are refreshed. Field-level delete at API 68 is also observed on a custom field
  of a standard DMO and on unmapped fields in a second org. The command writes
  project files (existing DMO and mapping files only) and changes every mapping that
  holds a pair for a named field.
- Field removal with mapping pairs is observed at API 68 only, in one org, on empty
  synthetic DMOs in the default data space. Other orgs, other API versions,
  data-bearing objects and non-default data spaces are not verified.
- Removing a field that holds data or is referenced by a segment, calculated insight,
  relationship or other component is not verified; if Salesforce rejects it, the
  deploy fails with `DMO_FIELD_REMOVAL_FAILED` and its message.
- The `isMapped` marker that reads return on mapped fields is kept in retrieved files
  but belongs to the mapping: it is never sent, compared or required, so the same
  file deploys unchanged to an org where the DMO is not mapped.
- A PATCH and a field removal of the same deploy are two separate writes. If the
  removal fails, the PATCH stays in place.

### Observed run times

During deploy the plugin reads data lake objects, DMOs and mappings over one
authenticated connection per org and API version. Writes (POST, PATCH and Metadata
API deployments) run through the Salesforce CLI. Reads that wait for a write to
settle are spaced explicitly: the settle reads after a data lake object, DMO or
mapping write take up to 6 reads, 3 seconds apart; the DMO readback after a DMO
write and the readback after a field removal take up to 6 reads, 5 seconds apart.
Each loop stops as soon as the state is confirmed.

Measured at API 68 in one org on empty synthetic fixtures:

| Operation                                                                                                           | Time |
| ------------------------------------------------------------------------------------------------------------------- | ---- |
| Create a data lake object, a custom DMO and their mapping                                                           | 45 s |
| Deploy 2 data lake objects, a DMO and 2 mappings again, all unchanged                                               | 9 s  |
| Mapping deploy removing one pair                                                                                    | 17 s |
| Two mapping deploys, each adding one pair                                                                           | 32 s |
| Data lake object, DMO and mapping: one field added to the data lake object and the DMO, one pair added, one dropped | 64 s |
| Mapping file and DMO file with `--allow-field-removal`, removing a mapped field                                     | 29 s |
| `delete --field` on a field mapped by two mappings                                                                  | 28 s |
| `delete -m mapping:<Name>` (not the last mapping of a custom DMO)                                                   | 21 s |
| Delete two custom DMOs                                                                                              | 24 s |
| Create 2 data lake objects, a custom DMO and 2 mappings (one onto `ssot__Brand__dlm`)                               | 90 s |
| Deploy the 5 retrieved lean files again, all unchanged                                                              | 10 s |
| `delete -m mapping:<Name>`, its local file removed                                                                  | 27 s |
| Delete a DMO and its data lake object, both local files removed                                                     | 28 s |

Salesforce processing time varies; these numbers show the order of magnitude, not a
guarantee.

## Metadata examples: prerequisites and qualification

The chapters below document **standard Salesforce CLI Metadata API retrieval**
and separately bounded mapping deployment and custom DMO deletion at API `65.0`. These `sf project` commands are provided by
Salesforce CLI, not additional `sf data360` plugin commands. Successful retrieval
proves a source export, **not full CRUD, cross-org portability or safe replay**.
The plugin's own native DMO retrieval, creation, update and deletion are described
under [Public DMO workflow](#public-dmo-workflow) and [Read-only deploy preview](#read-only-deploy-preview).

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

#### Native plugin workflow

Native `retrieve`, `deploy` and `delete` accept optional `--dataspace NAME`
(`--data-space` is a compatibility alias). Neither spelling has a CLI default;
specify only one spelling per invocation. An explicit scope must match the saved
artifact and freshly observed target/parent identities before mutation.

Mapping list, detail, create and additive update requests include the
`dataspace` query only when explicitly supplied. Omission uses the documented
mapping default locally for identity checks, without injecting `dataspace=default`
into HTTP requests. DMO create/update includes optional `dataSpaceName` only with
an explicit flag; creating a nondefault DMO with an omitted flag is refused.
DLO create is different: its required `dataspaceInfo` membership comes from the
validated artifact identity even when the flag is omitted. DLO update gains no
scope body, and DLO/DMO detail, delete and collection URLs gain no invented filters.
DLO identities use actual memberships (explicit scope must be present); DMO
identities use the response's actual `dataSpaceName`.

Native inventory still paginates the complete bounded collection and filters
response memberships locally: omitted scope retains default-space discovery,
not an all-space export. Explicit scope selects the matching response space;
ambiguous same-name inventory remains blocked. Legacy families and dependency
adapters remain default-only. Artifact schema/version and canonical paths are
unchanged; overwriting a different dataspace's file is refused even with
`--overwrite`. This is documented parameter plumbing, not live nondefault-space
lifecycle qualification; the Partial support ratings and existing API/version,
processing, parent, survivor and destructive-operation limits remain unchanged.

```sh
sf data360 retrieve -m dmo:Customer__dlm -o SOURCE_ALIAS --output-dir ./project --json
sf data360 deploy -m dmo:Customer__dlm -o TARGET_ALIAS --preview --json
sf data360 deploy -m dmo:Customer__dlm -o TARGET_ALIAS --json
sf data360 delete -m dmo:Customer__dlm -o TARGET_ALIAS --preview --json
sf data360 delete -m dmo:Customer__dlm -o TARGET_ALIAS --json
```

This is the only DMO route of the plugin. Default/`auto` selects API `68.0`;
explicit numeric pins from `61.0` are preserved, not upgraded, and
`--api-version latest` is not accepted. The behaviour below is observed at API 68
only, on empty, unmapped custom DMOs in the default data space. The full list of
categories, field data types, limits and refusals is under
[Public DMO workflow](#public-dmo-workflow).

Exact native retrieval saves `data360/dmo/Customer__dlm.dmo-meta.json` with
`schemaVersion`, `kind`, logical `identity` and `spec`. It preserves field
definitions without generated fields: fields read as `System`, `DataSource__c`,
`DataSourceObject__c`, `InternalOrganization__c` and `KQ_` names are left out.
Primary keys and the standard fields of a standard DMO are always saved, and deploy
keeps the generated fields from the org, so a retrieved file deploys back
`unchanged`. Source record IDs and
runtime observations are excluded. Keys that only reads return (`creationType`,
`isDistinct`, `usageTag`, `keyQualifierName`) stay in the file and are never sent.
Differing files require `--overwrite`; identical bytes are unchanged. Standard,
namespaced and generated DMOs can be retrieved. A standard DMO can be deployed for
its custom fields, object label and object description only; generated DMOs are not
deployed, and neither kind is deleted.

Deployment resolves the full target API name. Only confirmed HTTP404 permits
creation; other lookup failures stop. Creation sends the authored category, fields
(any data type), labels, descriptions and extra keys as written, without generated
fields; Salesforce decides and its error is reported. Existing targets use
name-based PATCH for the object label, the object description (absent
`spec.description` leaves it as is; an empty string clears it), existing field
labels and added fields. Changing an existing field's data type or moving the
primary key is refused before any write (`UNSUPPORTED_DMO_FIELD_CHANGE`), as is
adding a generated field or a second primary key
(`UNSUPPORTED_DMO_FIELD_ADDITION`). A custom target field missing from the file is
refused with the same `UNSUPPORTED_DMO_FIELD_CHANGE` unless `--allow-field-removal`
is set; then one Metadata API destructive change for `CustomField` removes those
fields after the PATCH, in the DMO position. Salesforce drops the mapping pairs of
the removed fields with them, and the selected mappings that target the DMO deploy
afterwards and find those pairs already gone. The primary key and generated fields are never
removed. A changed category is sent and Salesforce rejects it. A PATCH response can still
contain the old state, so the plugin polls reads (up to 6, 5 seconds apart) to
confirm the requested definition and the absence of removed fields; a write is
never repeated.
Explicit native batches support DLO, DMO and mapping in that dependency order, with
independent parent settlement. `--changed-since` uses
the same native file; see
[Dependencies and Git selection](#dependencies-and-git-selection).

Delete executes by default without prompting and addresses only the freshly
resolved full DMO name. There is no dependency preflight. `--preview` is strictly
read-only. Delete and delete preview refuse standard, namespaced and
platform-generated DMOs with `UNSUPPORTED_DMO_TARGET`; deploy refuses the namespaced
custom and the platform-generated ones. Already absent is
unchanged; the plugin performs no further deletion, write retry or rollback (a
confirmed deletion removes the local file, see
[Local files after delete](#local-files-after-delete)), but Salesforce may cascade the deletion to the DMO's mapping.
DMO delete reads and the DELETE use the bound authenticated connection directly
(no child `sf api request rest`, no token refresh, no HTTP retry, redirects
refused), so each request is sent at most once. After HTTP204 one read by name
settles the item: 404 reports `confirmed-deleted`; a still-readable DMO or a
failed read reports `deletion-unconfirmed` (exit code 1, `DMO_DELETE_NOT_CONFIRMED`).
The same name in a `DELETING` state reports `deletion-processing`; this DMO state is
assumed by analogy with DLO and is not verified by documentation or a live run,
so an asynchronous DMO delete may report `deletion-unconfirmed` instead. Nothing is
replayed; confirm final absence with a later read-only check. Without token
refresh an expired session stops the command (HTTP 401); log in again and rerun.
This bounded definition workflow does not qualify ingestion or cross-org migration.

`__dlm` identifies a Data Model Object. Standard retrieval writes the object and
its decomposed field XML under `force-app/main/default/objects/`.

#### Read / Retrieve

Retrieve the standard, namespaced Account DMO **for inspection only**:

```sh
sf project retrieve start --metadata CustomObject:ssot__Account__dlm --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
```

Or retrieve a custom DMO:

```sh
sf project retrieve start --metadata CustomObject:Customer__dlm --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
```

At API 65.0 the retrieved object includes field definitions and lookup references,
but an object export alone is not a complete mapping, relationship or ingestion
export. Do not create, update or delete a standard DMO such as Account through this
route.

#### Create

Standard Metadata API creation is **not verified**. At API 65.0 a check-only
deployment of a custom DLO, DMO and mapping together fails with primary-key,
key-qualifier and mapping internal errors. Component successes reported inside a
failed check-only deployment are not persisted objects. There is no runnable
standard create example. The plugin does not use this route: it creates DMOs through
the native API as described under [Native plugin workflow](#native-plugin-workflow).

#### Update

Standard Metadata API update is **not verified**. The plugin's native update
(object label and description, existing field labels, added fields) is separate
from Metadata XML deployment. Changing a field's data type and moving the primary
key are not possible through the native API and are refused.

Removing a field is not possible through the native API either. A Metadata API
destructive change for `CustomField` `<ObjectName>__dlm.<FieldName>__c` removes a
custom field; this is observed on empty, unmapped custom DMOs with a manifest at
version `65.0`. Mapped or data-bearing fields are not verified. The deployed
directory holds an empty `package.xml` and this `destructiveChanges.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Customer__dlm.Phone__c</members>
        <name>CustomField</name>
    </types>
    <version>65.0</version>
</Package>
```

```sh
sf project deploy start --metadata-dir ./destructive --target-org TARGET_ALIAS --wait 10 --json
```

`sf data360 deploy --allow-field-removal` runs the same deployment for every custom
target field missing from the DMO file, with the native API version in use as the
manifest version. The primary key and generated fields are never removed.

#### Delete

At API 65.0 a standard Metadata API destructive deployment that selects exactly one
empty custom DMO deletes it. Salesforce cascades the deletion to the DMO's mapping;
the mapped DLO keeps its ID, status, fields and Metadata. This is observed for an
empty custom DMO with one mapping and no relationships. The plugin does not use this
route: `sf data360 delete` uses the native API as described under
[Native plugin workflow](#native-plugin-workflow).

The destructive deployment needs two manifest files in an isolated source project.
They are a low-level Metadata API mechanism, not a plugin workflow, and should stay
out of Git.

`package.xml` (no component selected):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <version>65.0</version>
</Package>
```

`destructiveChangesPost.xml` (the exact DMO only):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>Customer__dlm</members>
    <name>CustomObject</name>
  </types>
  <version>65.0</version>
</Package>
```

Command shape:

```sh
sf project deploy start --manifest package.xml --post-destructive-changes destructiveChangesPost.xml --target-org TARGET_ALIAS --api-version 65.0 --test-level NoTestRun --wait 5 --json
```

**This command is destructive; do not point it at business assets.** Deletion can
cascade to mappings and relationships; downstream calculated insights, segments,
identity resolution or activations can block it. Not verified: downstream
dependency visibility, cascade behaviour beyond a single mapping, and deletion of
populated or business DMOs.

`sf project delete source` is **not verified** for DMOs and also deletes local
source files.

### Data Lake Object (DLO): native definition CRUD

`__dll` identifies a Data Lake Object, distinct from a DMO. This workflow manages
its definition, not a connector, stream, source credentials or row ingestion.
The [native workflow rationale](#native-dlo-definition-workflow) explains why this
replaces the former Metadata XML export and Ingestion API source-schema workflow.

Direct DLO creation also has a demonstrated use as a **precreated transform output**,
without a DataStream for that output. A native API68 `CUSTOM` / `BATCH` transform
with an `STL` definition bound that directly created output DLO and completed a
run with `SUCCESS` in 47 seconds, processing and writing zero rows. The source
DLO was also directly created as an empty test fixture; ordinary transform sources
may instead contain ingested data. Precreation was **not proven mandatory**, and
automatic output provisioning was **not tested**. The bounded Data Transform
retrieve/deploy workflow below is separate from this native API qualification;
public installed, populated-data and cross-org acceptance remain unperformed.

#### Read / Retrieve

```sh
sf data360 retrieve --metadata dlo:CustomerSource__dll --target-org SOURCE_ALIAS --api-version 68.0 --output-dir ./project --json
```

Canonical output is `./project/data360/dlo/CustomerSource__dll.dlo-meta.json`.
The full API name, including `__dll`, is retained in the filename and identity.
The saved definition excludes the source DLO record ID and runtime/audit response
wrappers. It saves the authored fields only: the fields Salesforce generates
(`cdp_sys_SourceVersion__c`, `DataSource__c`, `DataSourceObject__c`,
`InternalOrganization__c`, `cdp_sys_PartitionDate__c` and the key qualifier
`KQ_<Key>__c`) are left out, except a field named by `eventDateTimeFieldName`,
which always stays. Deploy keeps the generated fields from the org, so the file
deploys back `unchanged`.
For DLO and DMO, a key qualifier combines an ID with source context to avoid
collisions. Native CREATE generates this qualifier and additive PATCH preserves
it: omitting its saved definition is not field deletion or mapping auto-pair proof.
`Id__c`, other fields, custom qualifiers and `keyQualifierName` references remain
unchanged; raw API responses remain complete. Separate API68 evidence showed DLO
seven raw → six saved fields after CREATE and eight raw → seven saved after PATCH.
DLO Metadata uses
`definitionCreationType=System` / `usageTag=KEY_QUALIFIER`; DMO API uses
`creationType=System` / `usageTag=KeyQualifier`, not the same enum spelling.
These historical experiments do not broaden operation-specific qualification.
Native default/auto now selects API68 with explicit numeric pins preserved.
Save policies are not create payload policies.
Identical bytes are unchanged; replacing differing output requires `--overwrite`.

#### Create / Update

```sh
sf data360 deploy --metadata dlo:CustomerSource__dll --target-org TARGET_ALIAS --api-version 68.0 --preview --json
sf data360 deploy --metadata dlo:CustomerSource__dll --target-org TARGET_ALIAS --api-version 68.0 --json
```

Deploy is manifest-free and automatic: resolve the exact API name in the **target**.
An existing target with a supported difference selects PATCH using its resolved ID.
An equal label and preserved field inventory return `unchanged` / `not-attempted`
without POST or PATCH; field ordering and the omission of generated fields do not
trigger a write. A file may omit the fields Salesforce generated:
`cdp_sys_SourceVersion__c`, `DataSource__c`, `DataSourceObject__c`,
`InternalOrganization__c`, the DateTime field `cdp_sys_PartitionDate__c` that
Salesforce adds to Engagement DLOs, and the key qualifier of the primary key
(`KQ_<Key>__c`, for example `KQ_Id__c`). They stay as they are, so a hand-written file with only the
authored fields deploys onto its existing DLO. Any other field of the target that the
file omits is refused (`UNSUPPORTED_DLO_FIELD_CHANGE`). A listed field is compared on
the keys the file states: keys that only the org's copy carries are ignored, and a
stated key that differs is refused with the same code. Only an authoritative
not-found response permits POST. Authentication, permission, malformed-response and
other lookup failures stop; a failed PATCH never falls back to POST. `--preview`
performs the target comparison without any mutation and is never the default.

Creation submits authored fields with the intended primary key, not generated
qualifier/system fields from retrieval. Salesforce generated those fields in the
verified standalone API 68 experiment. Create sends `spec.category` as the file
states it and Salesforce decides; its API lists `Profile`, `Engagement`, `Other`,
`Directory_Table`, `Observability_Table`, `Insights`, `Vector_Embedding` and
`Content`. An Engagement DLO needs `spec.eventDateTimeFieldName`, the full name of
one of the listed fields (with `__c`); create sends it without the suffix, and
retrieval saves it. Local validation accepts nonempty `dataType` strings rather than
a Text-only allowlist, and Salesforce decides the type of a field.

On an existing DLO, UPDATE admits label changes and ordinary nonprimary field
additions while preserving existing fields and primary-key configuration. Salesforce
rejects a PATCH that names the category or the event field (HTTP 400, unrecognized
field), so a changed category is refused with `UNSUPPORTED_DLO_CATEGORY_CHANGE` and
a changed event field with `UNSUPPORTED_DLO_EVENT_FIELD_CHANGE`, both before any
write. A changed existing field is rejected by Salesforce (HTTP 400, fields already
exist), and removing one is refused by the Metadata API (setup object in use); the
REST field delete route works only for external DLOs. Field removal, existing-field
changes and primary-key mutation are therefore refused with
`UNSUPPORTED_DLO_FIELD_CHANGE`, which says why.

Observed at API 68 through the plugin in one org: a Profile
and an Engagement DLO created (27 seconds for both), redeployed unchanged (4
seconds), retrieved and the retrieved files redeployed unchanged (3 seconds), a field
added to the Engagement DLO (14 seconds) and a changed event field refused with
nothing written. Raw requests in two orgs confirmed the category, event-field,
label, field-removal and field-delete responses above. Data-bearing DLOs, the other listed
categories and non-default data spaces are not verified.

The source record ID is never replayed into the target. Request acceptance is not
terminal completion: POST/PATCH can return `PROCESSING` before independent GET
shows `ACTIVE`. Use bounded read-only checks for the intended full field/key state;
never retry an ambiguous write automatically.

#### Delete

```sh
sf data360 delete --metadata dlo:CustomerSource__dll --target-org TARGET_ALIAS --api-version 68.0 --preview --json
sf data360 delete --metadata dlo:CustomerSource__dll --target-org TARGET_ALIAS --api-version 68.0 --json
```

**Delete executes by default without an additional confirmation prompt.** Use
`--preview` for a read-only exact-target lookup/report. Execution resolves the
selected target and deletes that target ID only; no cascade, stream/source/DMO
cleanup is performed. After a confirmed deletion the local file is removed (see
[Local files after delete](#local-files-after-delete)). Already absent is unchanged.

Before a DLO is deleted (and in `--preview`), the plugin reads what Salesforce lists
as depending on it. Salesforce refuses to delete a DLO that something depends on
(HTTP 412 `DEPENDENCY_EXISTS`), for example a DLO mapped onto a DMO, which the list
names as the DMO. A dependent that the same command does not delete stops the item
before any write with `DLO_DEPENDENCY_EXISTS`, naming each dependent. A DMO dependent
counts as deleted by the command when `dmo:<Name>` is selected, or every mapping
between the DLO and that DMO is selected as `mapping:<Name>`. Selections run
mappings first, then DMOs, then DLOs, whatever order they are given in; before the
DLO's DELETE the plugin waits (up to 6 reads, 3 seconds apart) until the list is
empty, otherwise `DLO_DEPENDENCY_PENDING`. A DLO or DMO DELETE that Salesforce answers with an HTTP 4xx status reports mutation `rejected`: nothing was deleted. The dependency lists of all selected DLOs are read before the first write of the command, so an uncovered dependent stops the command before anything is deleted. A selected DMO removes its own mappings; the last mapping of a custom DMO selected next to that DMO is not sent on its own and is reported `removedWith` the DMO. Failed
or ambiguous mutation outcomes stop without retry or rollback; inspect the target
before another attempt. DLO delete reads and the DELETE use the bound
authenticated connection directly (no child `sf api request rest`, no token
refresh, no HTTP retry, redirects refused), so each request is sent at most once.
After HTTP204 one read by name settles the item: 404 reports
`confirmed-deleted`; the same target in a `DELETING` state reports
`deletion-processing` (server still processing); a still-readable DLO or a failed
read reports `deletion-unconfirmed` (exit code 1, `DLO_DELETE_NOT_CONFIRMED`).
Nothing is replayed; confirm final absence with a later read-only check. Preview
uses the same bound read. Without token refresh an expired session stops the
command (HTTP 401) before any write; log in again and rerun. Human output prints
the diagnostic code and message for every blocked or failed delete.

Installed API68/default standalone Other/default cross-org acceptance now covers
source retrieval followed by target creation from that exact portable file, different
org-local IDs, independently regenerated full field/key inventories, a label plus
additive Text update, and a zero-write repeated deployment. Both owned empty fixtures
were deleted with independent name/ID absence checks. This is not ingestion, populated
object, mixed-family dependency or released-package qualification.

Earlier public plugin lifecycle acceptance was API68/default: a fresh owned fixture was
created, retrieved with seven raw readback fields, updated with preserved primary key and eight
raw readback fields (historical counts, not current saved-file counts), previewed without deletion, then deleted by default with absence readback
and the local file retained. Separately, native API61–68 standalone CRUD succeeded;
API60 returned 404 for all four operations. API61 is the lowest successful version
in that tested matrix, not a universal qualification claim: native default/auto is
API68, while explicit numeric native pins from API61 are preserved.
Neither observation qualifies populated, stream-owned or cross-org ingestion behavior. Standard Metadata retrieval worked
at requested APIs 65–68; schema-specific redeploy and historical Metadata delete
failures are separate evidence, not blanket declarations of unsupported APIs.

### Data Transforms: bounded definition retrieve/deploy and native qualification

Direct DLO creation has a demonstrated use as a **precreated transform output**,
without a DataStream for that output. A native API68 `CUSTOM` / `BATCH` transform
with an `STL` definition bound that directly created output DLO and completed a
run with `SUCCESS` in 47 seconds, processing and writing zero rows. The source
DLO was also directly created as an empty test fixture; ordinary transform sources
may instead contain ingested data. The output binding is the practical reason for
direct creation, not a requirement to create every source this way.

This qualifies only the tested precreated-output path: precreation was **not proven
mandatory**, and automatic output provisioning was **not tested**. A zero-row run
does not qualify populated transformations, other API versions or cross-org replay.
The transform, source DLO and output DLO were removed after the experiment.
The plugin separately supports exact `data-transform:Name` retrieval and bounded
single-file definition deployment using native API68 (`auto` or explicit `68.0`),
with omitted or explicit `default` dataspace. Canonical files are
`data360/dataTransforms/Name.dataTransform.json`; use either that exact file with
`--source-dir` or one exact `--metadata data-transform:Name` selector.

```sh
sf data360 retrieve -m data-transform:Example --target-org SOURCE_ALIAS --api-version 68.0 --json
sf data360 deploy -m data-transform:Example --transform-operation create --preview --target-org TARGET_ALIAS --json
sf data360 deploy -m data-transform:Example --transform-operation create --allow-processing --target-org TARGET_ALIAS --json
sf data360 deploy -m data-transform:Example --transform-operation update --transform-target-id EXACT_NATIVE_ID --allow-processing --target-org TARGET_ALIAS --json
```

Create forbids a target ID and sends one create-only POST, never upsert. It does
not prove name absence; native collisions fail without fallback. Update requires
an exact native `1dt` record ID and permits label/description-only changes to the
admitted existing CUSTOM/BATCH/STL definition; GET 404 never becomes create.
Both source and output must bind to compatible existing ACTIVE/Other/default DLOs
with the admitted primary-key mapping. No output provisioning, logic/schema changes,
Git selection, run or schedule is offered. The transform may share a deploy with other
families: it runs after streams and native DLO/DMO/mapping/relationship items and before
Identity Resolution, calculated insights, Segments and graphs.

Transform prerequisite DLO reads use the same bound API68 Connection, exposing GET only;
they do not spawn the general DLO CLI adapter. Transform requests disable authentication
refresh, redirects and retry methods explicitly, including JSforce's HTTP420 retry path.
General DLO CRUD behavior is unchanged.

Preview performs GET-only target/prerequisite checks: server validation remains
pending and no processing acknowledgment is needed. Changed create execution runs
server validation (update skips it: the validation endpoint rejects the owner's own output, live-observed, and update never changes logic) and requires `--allow-processing`; unchanged repeat performs no
validation POST or definition write and requires no acknowledgment. Input bytes
are rechecked after preview reads and before mutation or unchanged return. Updates
then recheck the exact target definition and schedule immediately before dispatch.
These checks narrow drift windows; without a server-side conditional write they do
not provide atomic concurrency protection.
Only independently read-back definitions are reported as confirmed writes. Errors
after write dispatch are unknown outcomes, not permission to replay. Server
`PROCESSING` is reported explicitly and is not computation completion.

Public delete: `sf data360 delete -m data-transform:Name` (API68/default only; `--preview` is GET-only). One delete may name several transforms; each is resolved and deleted on its own in the transform phase. The name is resolved to the record ID through the complete transform list (ignoring case; no match is `unchanged`, two or more are refused with `TRANSFORM_TARGET_NOT_RESOLVED`) and the definition is read from the org. It requires a CUSTOM/BATCH/ACTIVE STL target with no schedule, and bounded visible-inventory presence of both ID and name. One native DELETE is sent without retry; confirmed deletion needs a complete inventory omitting both ID and name plus preserved source/output DLOs, otherwise the result is `deletion-unconfirmed` (nonzero, never replay). No DLO, run or data cleanup; exhaustive external-consumer exclusion is not established, and the pre-delete recheck narrows but does not eliminate concurrent-edit races.

These command paths have offline regression coverage. Local package installation,
alias/help and pre-auth admission checks and installed synthetic regressions are
separate from live public Transform lifecycle acceptance, which has not been
performed. The native zero-row experiment above is separate evidence, not
public-command, populated-data or cross-org qualification.

### DLO-to-DMO mapping: native definition CRUD

#### Read / Retrieve

The plugin retrieves canonical native mapping JSON, not opaque Metadata XML:

```sh
sf data360 retrieve --target-org SOURCE_ALIAS --json
sf data360 retrieve --target-org SOURCE_ALIAS -m mapping --json
sf data360 retrieve --target-org SOURCE_ALIAS -m mapping:ExactMappingName --api-version 68.0 --json
```

Omitted selectors retrieve all implemented native families (DLO, DMO and mapping);
a bare type retrieves its inventory, and exact members are sorted and deduplicated.
Optional `--dataspace` selects explicit scope as described in the native workflow;
omission retains default-space discovery. Nondefault scope is parameter plumbing,
not live nondefault lifecycle qualification. Default/`auto` selects native API `68.0`;
explicit numeric pins are preserved. Native retrieval/deploy admits numeric versions
from `61.0`; pair removal and whole-mapping deletion are admitted at the same
versions. Installed API61 create, read and one-pair addition with omitted scope is
recorded above; pair removal is observed through the plugin at API 61, 64 and 68,
whole-mapping deletion at API 68. `latest` is not a native mapping route.
Output is `data360/mapping/<name>.mapping-meta.json` beneath `--output-dir` (default cwd).
The document contains `schemaVersion: 1`, `kind: "mapping"`, logical `identity` and
`spec` with DLO/DMO developer-name bindings and the authored field pairs. The pairs
Salesforce generates (system pairs and the key-qualifier pair; on a standard DMO the
pairs onto `ssot__DataSourceId__c`, `ssot__DataSourceObjectId__c`,
`ssot__InternalOrganizationId__c` and `KQ_Id__c`) are left out; the authored key
pair stays. Retrieve and deploy decide this with one rule from fresh reads of the
source DLO and target DMO, so a pair left out of a retrieved file is never read as
a removal. When those reads fail, retrieve refuses the mapping with
`MAPPING_GENERATED_PAIRS_UNPROVEN` and writes nothing for it. Retrieved field selectors
are retained; source record IDs and runtime observations are not replayed. Identical
bytes are unchanged; differing files require `--overwrite`. Independent failures
retain successful member receipts and return nonzero status.

#### Create / desired-state mapping reconciliation

Choose exactly one explicit input mode: exact project member selectors, or local
canonical files/directories. Bare types, wildcards and omitted deploy selections
are refused; native mapping Git deployment and legacy XML deployment are not admitted.

```sh
sf data360 deploy -m mapping:CustomerMapping -m dmo:Customer__dlm -m dlo:CustomerSource__dll -o TARGET_ALIAS --preview --json
sf data360 deploy -m mapping:CustomerMapping -m dmo:Customer__dlm -m dlo:CustomerSource__dll -o TARGET_ALIAS --json
sf data360 deploy --source-dir ./data360/mapping/ExactMappingName.mapping-meta.json -o TARGET_ALIAS --preview --json
sf data360 deploy --source-dir ./data360/mapping/ExactMappingName.mapping-meta.json -o TARGET_ALIAS --json
```

Native execution orders DLO, then DMO, then mapping, regardless of selector order.
Each parent is independently read back and settled before dependent writes: DLO
readiness requires `ACTIVE` and the desired definition; DMO GET has no status field,
so its identity, schema, key and other required definition properties are checked,
not an invented DMO `ACTIVE` status. If preview depends on parents only planned in
the same selection, it reports `planned-dependencies`, target unknown and no absence
proof (`MAPPING_DEPENDENCIES_PLANNED`), not confirmed create readiness.

With `--allow-field-removal`, a selected DMO that has custom fields to remove deploys
in its normal DMO position: its PATCH, then one Metadata API destructive change for
the fields. Salesforce drops the mapping pairs of a removed field itself, so the
selected mapping files that omit those pairs deploy afterwards and find them already
gone. The result has one item per file in DLO, DMO, mapping order; the DMO item lists
`removedFields` and `droppedPairs`. Removing a mapped DMO field therefore takes one
command: omit the field in the DMO file and its pair in the mapping file, and select
both. Every selected DMO is checked read-only before the first write; a mapped field
whose pair is not dropped by a selected mapping file refuses the whole batch with
`DMO_FIELD_REMOVAL_MAPPED`. See [Create and update](#create-and-update).

Creation resolves the exact DLO/DMO pair in the target and uses the target-generated
mapping name, not the source artifact name. An existing logically identical mapping
is a zero-write repeat. At every admitted API version, the existing
`spec.fieldMappings` array is the desired pair set: omitted authored pairs are
unmapped individually using fresh target selectors, then new pairs are added in one
names-only, selector-free PATCH. Create and update send the pairs the file lists;
Salesforce decides. The plugin applies no local rule on field data types, source and
target names, `KQ_` names, one source field mapped onto several targets or a target
another mapping of the DMO also holds. A pair whose source and target data types
differ is sent; the preview carries the non-blocking diagnostic
`MAPPING_FIELD_TYPES_DIFFER`, naming `Source (Type) -> Target (Type)`. A pair naming
a field that does not exist is refused with `MAPPING_FIELD_NOT_FOUND`, which names
the pair, the missing field and its object. A new mapping without a pair joining the
two primary keys is rejected by Salesforce (HTTP 400 `MISSING_ARGUMENT: Unable to
find Primary Key of DLO in POST request of Mapping Creation`), reported as
`MAPPING_HTTP_ERROR` with that detail. To retarget a pair, replace it in the file
with the new pair.

The file may list only the authored pairs: the pairs Salesforce generated (three
system pairs and the key qualifier pair of the target's primary key) are taken from
the org's copy and treated as part of the file, so they are never removed. The key
pair (source primary key onto target primary key, whatever their names and types, as
the org's `isPrimaryKey` flags say) must stay in the file
(`MAPPING_PROTECTED_PAIR_REQUIRED`). When the key pair cannot be identified, removal
is refused with `MAPPING_PROTECTED_LAYOUT_UNPROVEN` before any write, and so is a dropped pair onto a system or key-qualifier field that is not recognised as generated. Retained pairs
keep their target selectors. All checks precede the first removal. A pair is removed
even when another mapping of the same DMO targets the same field; the field then
stays mapped (`isMapped: true`) until the last mapping has dropped its pair, and the
readback requires exactly that. Any authored pair can be omitted, whatever its field
names, data type or target field (custom or standard); Salesforce decides whether the
removal is accepted. Unknown metadata and parent-binding changes are refused. Preview lists removals
before additions with zero writes. Exact final pairs, full parents and inventory are
independently checked, allowing only expected `isMapped` transitions. Partial or
unknown mutation stops immediately without write retry or rollback.

##### Standard DMO as mapping target

The target is a custom DMO or a standard DMO (`creationType` `Standard`, for example
`ssot__Brand__dlm`). Platform-generated DMOs, reads without a `creationType` and
custom DMOs under a namespaced name are refused with `MAPPING_TARGET_UNSUPPORTED`.
Everything above applies to a standard target as well: lookup of the exact DLO/DMO
pair, the target-generated mapping name, the unchanged repeat, readback and the batch
order DLO, DMO, mapping. The differences:

- **Authored pairs** may target standard fields and custom fields of the DMO, and
  Salesforce requires one pair joining the two primary keys, for example `Id__c` to
  `ssot__Id__c`. A typical file sends this body:

  ```json
  {
    "sourceEntityDeveloperName": "Source__dll",
    "targetEntityDeveloperName": "ssot__Brand__dlm",
    "fieldMapping": [
      { "sourceFieldDeveloperName": "Id__c", "targetFieldDeveloperName": "ssot__Id__c" },
      { "sourceFieldDeveloperName": "Name__c", "targetFieldDeveloperName": "ssot__Name__c" }
    ]
  }
  ```

- **Generated pairs** are added by Salesforce and returned by retrieval:
  `DataSource__c` to `ssot__DataSourceId__c`, `DataSourceObject__c` to
  `ssot__DataSourceObjectId__c`, `InternalOrganization__c` to
  `ssot__InternalOrganizationId__c` and `KQ_Id__c` to `KQ_Id__c`. (On a custom DMO
  they are same-name pairs.) A file may list them or leave them out; they are never sent. A
  file with only the authored pairs creates a mapping and deploys onto the existing
  mapping: the generated pairs are taken from the org's copy and treated as part of
  the file. The authored primary-key pair must stay in the file
  (`MAPPING_PROTECTED_PAIR_REQUIRED`). The plugin recognises a system pair when its
  target is the source's namesake or `ssot__<Name>Id__c` and the target read reports
  that field as `System`, or, for the three names above, as `Standard`. The key
  qualifier pair is `KQ_<Key>__c` on both sides for the source primary key
  `<Key>__c`; before the first mapping the DMO has no such field yet.
- **Activation notice.** A standard DMO that was never mapped reads `isEnabled: false`
  and category `UNASSIGNED`. Its first mapping activates it: it becomes enabled, its
  category becomes `OTHER`, Salesforce adds the system field `KQ_Id__c` and sets
  `keyQualifierName` on the standard primary key. Deleting the mapping does not undo
  this. When the target read does not say `isEnabled: true`, the preview item and the
  created item carry the diagnostic `MAPPING_ACTIVATES_STANDARD_DMO`. It is
  information only: outcome and exit status are unchanged, and nothing is asked. An
  already enabled DMO gets no notice. A preview that reports `planned-dependencies`
  has not read the target and carries no notice.
- **Updates.** A pair is added like on a custom DMO. Any authored pair is removed by
  leaving it out of the file, whether its target is a custom field or a standard
  field of the DMO (for example `Name__c` to `ssot__Name__c`). The generated pairs and
  the primary-key pair stay.
- **Delete.** `sf data360 delete -m mapping:<Name>` deletes the mapping as described
  under [Whole-mapping deletion](#whole-mapping-deletion), whatever pairs it holds.
  The last mapping of a standard DMO is deleted as well; the DMO stays enabled with
  its generated `KQ_Id__c` field and no mapped fields.

Observed at API 68 through the plugin on the standard DMO `ssot__Brand__dlm` in two
orgs. Where the DMO was already active, a hand-written file with the two pairs above
created the mapping together with its data lake object, Salesforce added the four
generated pairs, and the mapping retrieved afterwards deploys back with no change.
Where the DMO was not active, the mapping preview shows
`MAPPING_ACTIVATES_STANDARD_DMO` and changes nothing; the deploy then creates the
mapping with outcome created and the same notice, and the DMO reads enabled with
category `OTHER` and the generated field `KQ_Id__c`. Deploying the retrieved mapping
file without the pair onto `ssot__Name__c` removes that pair. The only mapping of the
DMO is deleted in both orgs, in one of them while it still holds the pair onto
`ssot__Name__c`. Removing a pair for a custom field of a standard DMO through the
plugin is covered by synthetic tests only. In one org, a hand-written data lake
object file and a mapping file with only the two pairs above were created and
deployed again: both report `unchanged`. For run times see
[Observed run times](#observed-run-times).

To remove a field mapping, remove its pair from `spec.fieldMappings`
and deploy the JSON file. This removes the connection between the two
fields, not the DMO field itself. Keep the primary-key pair; the generated qualifier
and system pairs may be listed or left out. To retarget a field pair, replace the old pair with
the new pair: deployment removes the old connection first, then adds the new one.
This does not change the mapping's source DLO or target DMO.

Without `--json`, deployment and deletion print one action line per component,
including its type and API name. A confirmed mapping update also prints
`Deleted field mappings: source -> target, ...` and
`Added field mappings: source -> target, ...` on separate lines. Empty lists are
omitted; a retarget appears in both lists. Preview lines start with `Planned` and
never claim a completed write. Unchanged items are not reported as updated, and
failed or unknown outcomes do not print completed field-change lists. `--json`
keeps the structured result without these human-readable lines.

Execution ends with `Deployed: n (x created / y updated / z failed)`. The total
`n` is only the confirmed created plus updated components. Unchanged, blocked and
unattempted items are excluded; each failed component counts once, even if several
field operations were attempted. Preview never claims a completed deployment.
For example: `Deployed: 2 (1 created / 1 updated / 1 failed)`.

Retrieval prints each successfully retrieved name, grouped by type, followed by
`Downloaded <type>: n` for that type (for example, `Downloaded mapping: 2`).
Named selection, type selection and bare retrieve count successful component
receipts, including unchanged local files, not requests, file counts or API
`totalSize`. Failures remain visible and are not counted. A count does not qualify
inventory completeness or resolve the deferred mapping inventory limitation.

These reconciliation paths are observed on empty synthetic definitions, with
installed public API68 reconciliation acceptance below. Populated-object and
cross-org guarantees are not established. No
implicit parent creation or PK/KQ inference is performed outside explicitly selected,
supported parent definitions.

Installed public API68 acceptance on owned empty custom definitions covers ordered
parent/mapping creation, canonical retrieval, an unchanged zero-write redeploy, one
additive pair and a second zero-write repeat. Installed JSON Text reconciliation also
passed removal of A with batch addition of D/E, then B-to-C same-source/new-target
retargeting and F-to-D new-source/same-target retargeting, sequentially on the same
empty fixture. Each reconciliation preview and repeat performed zero writes. Exact
desired pairs, retained selectors, full DLO state and DMO schema/nonflag properties
were independently verified, allowing only expected `isMapped` changes. Full raw
DMO preservation is therefore not claimed across reconciliation. This is not
populated-object, cross-org, arbitrary-schema or all-version qualification.

Observed through the plugin on empty synthetic fixtures in one org: a mapping created
with a Number pair, a renamed pair (`Note__c` to `Other__c`) and one Number source
onto a Number and a Text target, ACTIVE (66 seconds for two DLOs, the DMO and the
mapping); its preview `noop` with `MAPPING_FIELD_TYPES_DIFFER`, a repeat deploy and a
deploy of the retrieved file `unchanged` (5 seconds each); a pair removed at API 64
(16 seconds) and API 61 (17 seconds); a file dropping the key pair refused with
`MAPPING_PROTECTED_PAIR_REQUIRED`, nothing written.

#### Whole-mapping deletion

```sh
sf data360 delete -m mapping:ExactTargetMappingName -o TARGET_ALIAS --api-version 68.0 --preview --json
sf data360 delete -m mapping:ExactTargetMappingName -o TARGET_ALIAS --api-version 68.0 --json
```

`sf data360 delete -m mapping:<Name>` deletes the whole mapping with one Metadata API
destructive deployment: type `ObjectSourceTargetMap`, member the mapping developer
name. It does not unmap pairs first and sends no native DELETE. Any mapping is deleted
this way, whatever pairs it holds, including pairs onto standard fields (for example
`Name__c` to `ssot__Name__c`) and mappings onto standard DMOs. Deletion is admitted
at every native API version from `61.0`; default/`auto` is `68.0`.

- **Reads before the write.** The plugin reads the mapping, all mappings of its target
  DMO and the DMO itself. The selected mapping must be among the DMO's mappings
  (`MAPPING_INVENTORY_UNCONFIRMED` otherwise). An already-absent mapping is
  conservatively blocked without writes; unchanged-on-404 handling applies only to
  native DLO/DMO deletion.
- **The one refusal.** The last mapping of a custom DMO is refused before any write
  with `MAPPING_LAST_MAPPING_DELETE_BLOCKED`. Salesforce does not delete it: its
  Metadata API answers with an internal error and its native DELETE with HTTP `500`.
  The message names the DMO and the way out: delete the DMO
  (`sf data360 delete --metadata dmo:<Dmo__dlm>`), which removes its mapping; selected
  together with that DMO, the mapping is reported `removedWith` the DMO. Being
  the last mapping of a DLO is no obstacle, and the last mapping of a standard DMO is
  deleted normally; that DMO stays enabled with its generated `KQ_Id__c` field and no
  mapped fields.
- **Preview.** `--preview` performs zero writes: it runs the same reads and the same
  refusal and reports the single planned step `delete`.
- **The write.** One deployment of a temporary manifest (an empty `package.xml` and a
  `destructiveChanges.xml` naming the mapping), sent once and never retried. A
  deployment that Salesforce does not confirm as succeeded with the mapping reported
  deleted ends with `MAPPING_DELETE_FAILED` and Salesforce's problem text.
- **Confirmation.** The plugin polls (up to 6 reads, 5 seconds apart) until the
  mapping read returns a typed selected-mapping `404`. It then reads the DMO's
  mappings and the DMO again and requires that the other mappings (pairs and
  selectors) and the DMO's field names are exactly what they were;
  any difference is reported as `MAPPING_DELETE_SIDE_EFFECT`. A mapping that is still
  readable after the last poll gives `MAPPING_DELETION_UNCONFIRMED`.

Nothing is rolled back and no parent object is deleted. After a confirmed deletion
the mapping's local file is removed (see
[Local files after delete](#local-files-after-delete)). The
mapping and parent reads of `sf data360 delete` are sent on a bound authenticated
connection: no token refresh, no HTTP retry, redirects refused, so each read request
is sent at most once. An expired session stops the command with HTTP 401 instead of
refreshing; log in again and rerun after a read-only check.

Observed at API 68 through the plugin on empty objects in the default data space:

- A non-last mapping of a custom DMO with two mappings is deleted in 21 seconds; the
  other mapping and all 8 DMO fields are unchanged.
- The last mapping of the same custom DMO is refused with the message above; nothing
  is written.
- The only mapping of the standard DMO `ssot__Brand__dlm` is deleted in two orgs, in
  one of them while it still holds the pair onto the standard field `ssot__Name__c`.

Populated objects, non-default data spaces and API versions below 68 are not
verified live for whole-mapping deletion.

Supporting API68 route tests rejected retargeting only the DLO, only the DMO, or both
with HTTP `404` input-binding mismatch for both last and secondary mappings; original
bindings, pairs, selectors and parents remained unchanged. Raw API observations on
owned empty objects: DMO deletion cascaded its mapping but left the DLO; a second DMO
using the same DLO did not unlock native deletion of the original mapping (HTTP
`500`), whereas a second distinct DLO mapped to the same DMO did. In one experiment a
non-last native DELETE HTTP `204` also removed the DMO `Count__c`/`Gamma__c` fields;
the plugin does not send that request.

### DMO field relationship: native definition retrieve, create and delete

A relationship links a field of one DMO (the source) to a field of another DMO (the
target), for example an order's customer reference to the customer's key. The plugin
keeps one file per relationship at
`data360/relationship/<Name>.relationship-meta.json`:

```json
{
  "schemaVersion": 1,
  "kind": "relationship",
  "identity": {
    "apiName": "Order_CustomerId_map_Customer_Id_1794467679481",
    "dataSpace": "default"
  },
  "spec": {
    "sourceObjectName": "Order__dlm",
    "sourceFieldName": "CustomerId__c",
    "targetObjectName": "Customer__dlm",
    "targetFieldName": "Id__c",
    "cardinality": "ManyToOne",
    "relationshipOwner": "DataCloud"
  }
}
```

Salesforce generates the relationship name when it creates the relationship. A
hand-written file may use any name: deploy finds the relationship by its binding
(source object and field, target object and field), not by name. Cardinality and
owner are sent as written and Salesforce decides which values it accepts. All
relationship requests use the native route, default/`auto` API `68.0`; numeric pins
from `61.0` are kept.

#### Read / Retrieve

```sh
sf data360 retrieve -m relationship:Order__dlm -o SOURCE_ALIAS
```

`relationship:<Dmo__dlm>` writes every relationship whose source is that DMO, one
file each, beneath `--output-dir` (default: current directory). Several DMOs may be
selected. A bare `relationship` selector, meaning every relationship of the org, is
refused with `RELATIONSHIP_INVENTORY_UNQUALIFIED`. The plugin reads the DMO's
relationship list in pages of 200 by offset; the pages must add up to the reported
`totalSize` without duplicate names, otherwise that DMO stops with
`RELATIONSHIP_INVENTORY_INCOMPLETE`. The file keeps the six authored values only;
the id, labels, status and creation type are not saved. Identical files are
unchanged; a differing file requires `--overwrite`.

#### Create

```sh
sf data360 deploy -m relationship:Order_CustomerId_map_Customer_Id_1794467679481 -o TARGET_ALIAS --preview
sf data360 deploy -m relationship:Order_CustomerId_map_Customer_Id_1794467679481 -o TARGET_ALIAS
```

`--source-dir` with the file path works as well; the file must sit in a
`data360/relationship/` folder and its name must match `identity.apiName`. Two files
with the same binding in one command are refused (`DUPLICATE_IDENTITY`). Deploy lists
the source DMO's relationships and looks for the binding:

- Present with the same cardinality and owner: `unchanged`, nothing is written.
- Absent: one create request on the source DMO, then reads of the list until the
  relationship is `ACTIVE` with the requested cardinality and owner
  (`RELATIONSHIP_PERSISTENCE_UNCONFIRMED` if that does not happen in time; a status
  other than `ACTIVE` or `CREATING` stops the reads at once with the same code). The
  result names the relationship Salesforce created in `targetApiName`.
- Present with a different cardinality or owner: refused with
  `RELATIONSHIP_CHANGE_UNSUPPORTED` before any write.

Salesforce requires both DMOs to be mapped. Otherwise the create request answers
HTTP 400 `No ObjectSourceTargetMaps were found for the DMOs in the relationships.`,
reported as `RELATIONSHIP_HTTP_ERROR` with mutation `rejected`; the plugin does not
check this itself. In a batch, relationships run after DLOs, DMOs and mappings, so
one command can create both objects, their mappings and the relationship. A preview
of a relationship whose DMO the same batch creates reports `planned-dependencies`:
nothing is asserted about the relationship until the DMO exists.

#### Update

Salesforce has no route to change a relationship. To change its cardinality or
owner, delete it and deploy the file again. Deploy never deletes relationships.

#### Delete

```sh
sf data360 delete -m relationship:Order__dlm:Order_CustomerId_map_Customer_Id_1794467679481 -o TARGET_ALIAS --preview
sf data360 delete -m relationship:Order__dlm:Order_CustomerId_map_Customer_Id_1794467679481 -o TARGET_ALIAS
```

The selector names the source DMO and the relationship as the org knows it,
`sf data360 delete -m relationship:Order__dlm:<Name>`; a bare `relationship:<Name>` is
refused with `INVALID_SELECTION`. Delete reads no local file: it lists the source DMO's
relationships and looks for the name, ignoring letter case. No match is `unchanged`, and
so is a source DMO that does not exist (its relationship list answers HTTP 404
`ITEM_NOT_FOUND`), so a rerun after the DMO was deleted finishes; any other list error
stops the delete;
two matches are refused (`AMBIGUOUS_RELATIONSHIP_TARGET`), and a match whose source
object is another DMO is refused (`RELATIONSHIP_TARGET_BINDING_MISMATCH`, naming the
right selector). In a `--changed-since` delete the source DMO and binding come from the
deleted file's base content; when no relationship has that name but one with that
binding exists under another generated name, the command refuses with
`RELATIONSHIP_NAME_MISMATCH`, deletes nothing and names that relationship. Otherwise it
sends one DELETE
(`ssot/data-model-objects/relationships/{name}`) and reads the source DMO's list
until the relationship is gone (`RELATIONSHIP_DELETION_UNCONFIRMED` otherwise). An
HTTP 4xx answer reports mutation `rejected`. According to the API reference only
custom relationships can be deleted; the plugin sends the request and reports
Salesforce's answer. In a delete command relationships run first, before mappings,
DMOs and DLOs. `--preview` only reads. There is no confirmation prompt. After a
confirmed deletion the local file is removed unless `--keep-local-files` is set.

Salesforce offers no read by relationship name (GET answers HTTP 405), and the
list's `nextPageUrl` does not advance, so the plugin always reads relationships
through a DMO's list with explicit offsets.

Observed at API 68 through the plugin in one org, on empty custom DMOs in the
default data space: one deploy created two DLOs, two DMOs, two mappings and the
relationship (123 seconds; its preview showed `planned-dependencies`); the repeat
was unchanged (4 seconds); retrieve by DMO (4 seconds) and a deploy of the retrieved
file were unchanged (4 seconds); the delete preview only read (5 seconds); the delete
was confirmed (9 seconds) and its repeat unchanged (3 seconds). Standard and
data-bearing DMOs, non-default data spaces, other API versions and cardinalities
other than `ManyToOne` are not verified.

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

### Public Segment workflow: native JSON API68

Use exact `segment:<name>` selectors with `sf data360 retrieve` to save one portable
`data360/segments/<name>.segment.json`; no companion Segment XML is required.
Default/`auto` uses API68. Separate same-version DMO detail and Metadata reads
validate the selected PROFILE model and Text primary field. The supported profile
is a single-model DBT definition, not arbitrary SQL or a general audience builder.

Deploy the exact JSON with `sf data360 deploy --source-dir <file> --preview` first.
Only authoritative native absence permits CREATE; an existing target uses the
bounded UPDATE comparison. Actual CREATE and changed UPDATE require
`--allow-processing`. Installed API68 acceptance covers absent-target creation and
a description update with independent full definition/preservation reads, including
accepted PROCESSING/COUNTING states. The human suffix `(server is still processing)`
means accepted configuration, not completed computation. Identical configuration
is a zero-write no-op without processing acknowledgement. Historical qualified
forward empty-audience selected-ID `IS NOT NULL` updates remain a bounded subset;
failed and partial earlier UPDATE observations below are not erased by later success.

Delete with `sf data360 delete --metadata segment:<name>`; `--preview` is read-only and
execution needs no confirmation flag. The segment is read from the org by name (one
the org does not have is `unchanged`) and must agree with fresh target identity,
definition and dependency checks.
One DELETE acknowledgement is not terminal absence: independent exact GET404
confirms deletion; a positively preserved transition may instead report processing.
Unknown outcomes stop without retry, replay, fallback or rollback. Installed API68
acceptance demonstrated zero-write preview/unconfirmed rejection, one DELETE204
and internal plus external GET404. The later conservative fresh-predispatch
processing guard is offline-qualified only; that final refinement was not separately
installed/live-tested. Transitional DELETE success branches are synthetic-only.

This is bounded default-space configuration lifecycle evidence, not cross-org,
lower-version CREATE/DELETE, arbitrary SQL, finished computation or released-package
qualification. Generated membership DMOs were not deleted; generated-resource,
physical storage and credit cleanup are unverified. Historical API65 XML-paired
retrieval and unchanged/deployment observations below are separate evidence, not
proof of the API68 JSON-only installed build.

### Segment: `MarketSegmentDefinition` (historical Metadata evidence)

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

### Native identity resolution: plugin retrieve, deploy and delete

Public `sf data360 retrieve`, `deploy` and `delete` use native API68 for default/`auto`
or explicit `--api-version 68.0`, in the default data space. Every ruleset the API
returns or accepts is supported: any configuration type and name, automatic run on or
off, case sensitivity, secondary DMO, filters, trusted sources, match rules,
reconciliation rules, and rulesets that are not published yet. An absent ruleset is
created with one POST; an existing one with a difference receives one full-settings
PATCH. An equal settled ruleset returns `unchanged` with no write.

Retrieve the exact owner to obtain its portable definition, then preview and deploy
that canonical file from the Salesforce project root:

```sh
sf data360 retrieve --metadata identity-resolution:Individual_ir01 --target-org source --api-version 68.0 --data-space default --json
sf data360 deploy --source-dir force-app/main/default/data360/identityResolution/Individual_ir01.identityResolution.json --target-org source --api-version 68.0 --data-space default --preview --json
sf data360 deploy --source-dir force-app/main/default/data360/identityResolution/Individual_ir01.identityResolution.json --target-org source --api-version 68.0 --data-space default --allow-processing --json
```

The portable definition retains labels/description, automatic-run and case settings,
match criteria, object reconciliation defaults, ordered source priorities and explicit
field overrides. An empty field-override list resets those fields to object inheritance;
source order is meaningful and is not sorted away. Dependencies are rebound to verified
target-local DMOs, fields and mapped DLO sources, rather than replaying source IDs or
guessing generated output names. A file without `trustedSources` is deployed like one
with an empty list.

Refused locally, because PATCH cannot carry the change: changing `configurationType` or
the secondary DMO of an existing ruleset (`blocked-changes`). Emptying filters or trusted
sources sends the empty list and Salesforce decides. A new ruleset's name must be
`<configurationType>` or `<configurationType>_<rulesetId>`, the name Salesforce gives it
(`IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH` otherwise). PATCH and DELETE wait for no in-flight work: a ruleset that is
`PUBLISHING` or `DELETING` is refused with `IDENTITY_RESOLUTION_NOT_SETTLED`, because
the plugin could not tell its own change from one already running. Run statistics
(`lastJobStatus`, `knownUnifiedProfiles` and similar) are not part of the file. Live:
an automatically running ruleset (`Individual_5810`, one match rule) was created in
about 11.5 minutes and deleted.

CREATE and PATCH automatically publish and can cause processing even with automatic
run disabled: execution requires `--allow-processing`, including generated-output
provisioning for CREATE. Preview is read-only. Success requires bounded asynchronous
settlement to `PUBLISHED`, independently equal full settings and its verified
generated unified/link output bindings. A transport acknowledgement alone is
not success. Settlement has finite read/time limits; an unconfirmed post-write outcome
is conservatively `unknown` and stops the batch without automatic retry or rollback.
Inspect that exact target before deciding what to do next. This is not an SLA or a
zero-effects/draft guarantee, and no explicit run or profile-computation claim is made.

#### Return without waiting: `--async`

After the write, deploy waits until Salesforce reports the ruleset `PUBLISHED` and
then checks the settings and generated outputs again. With `--async`, deploy runs
every check before the write as usual, sends the one POST or PATCH, checks that
Salesforce's immediate answer names this ruleset (its API name, or on an update
its existing ID), and returns without that wait:

```sh
sf data360 deploy --source-dir force-app/main/default/data360/identityResolution/Individual_ir01.identityResolution.json --target-org source --allow-processing --async --json
```

The item reports `creation-processing` or `update-processing` with mutation
`acknowledged-processing` (the same mutation word as an IR delete that is still
running), the command exits 0, and human output ends with
`accepted, still processing: 1`. `--async` applies to Identity Resolution only; a
selection without an IR is refused with `INVALID_ASYNC_SCOPE`. That includes
`--changed-since` when the change set holds no IR: the command exits 1, so drop
`--async` for such runs. A selection that also holds a calculated insight, Segment or
data graph using the ruleset's unified or link DMO is refused with
`IDENTITY_RESOLUTION_ASYNC_DEPENDENTS`, because those must wait for `PUBLISHED`.
Other items in the same batch still wait as usual. With
`--preview`, `--async` changes nothing, because preview never writes.

How it helps:

- The command does not wait for publishing (observed one to four minutes after the
  write) or for the checks after it.
- You can deploy several rulesets one after another and check them all later.

What it does not save: the checks before the write (dependencies, the absent or
current ruleset, generated outputs) run either way and take most of the time. Live
on one org, an `--async` create took 570 s and returned `creation-processing`; the
ruleset was `PUBLISHED` about a minute later. A plain create of a similar ruleset
took 695 s, and a rerun that only read and reported `unchanged` took 663 s.

How it can hurt:

- Nothing confirms that publishing succeeded, that the settings stuck, or that the
  unified and link DMOs were created. `acknowledged-processing` only means Salesforce
  accepted the request.
- Steps that need the published ruleset fail if you run them right away. For
  example, a Data Graph on the unified DMO needs a `PUBLISHED` owner; its preview
  reports `DATA_GRAPH_OWNER_NOT_PUBLISHED` until then.
- Deploying the same file again is refused with `IDENTITY_RESOLUTION_NOT_SETTLED`
  (exit 1, nothing written) while the ruleset is `PUBLISHING`.
- A publish that fails looks like a slow one until you run deploy again.

To check the result, run the same deploy again (with or without `--async`); this
rerun runs the full checks, so it takes as long as a deploy.
`IDENTITY_RESOLUTION_NOT_SETTLED` means it is still publishing. `unchanged` means it
settled with the file's settings and its generated outputs were verified. Any other
answer means it did not settle as written; retrieve the ruleset and inspect it.

Installed API68 source-org acceptance covers full-settings CREATE, exact canonical
retrieval and a zero-write unchanged repeat with 12 stable output bindings. Separate
qualified native PATCH evidence covers matching, object defaults, ordered source
priorities, field overrides, override reset and inheritance. This does not establish
general cross-org migration or released-package qualification. Separately installed
API68 DELETE acceptance covers read-only preview and acknowledged ongoing removal,
not terminal absence or physical profile-row removal.

For DELETE, select one exact owner by name; it is read from the org before the delete.
Preview is read-only, and execution needs neither a confirmation flag nor
`--allow-processing`:

```sh
sf data360 delete --metadata identity-resolution:Individual_ir01 --target-org source --api-version 68.0 --data-space default --preview --json
sf data360 delete --metadata identity-resolution:Individual_ir01 --target-org source --api-version 68.0 --data-space default --json
```

DELETE admits default/auto or explicit68 in default space, a settled ruleset (automatic
run on or off), exact source/settings/output/dependency checks and a fresh
target-local ID. No wildcard/batch, cascade or manual generated-DMO deletion.
The canonical file is an intended-settings expectation, not an ownership token or
permission to delete. Obtain approval and inspect known consumers; exhaustive external
consumer exclusion is not established.

Installed preview observed52 reads/0writes. Confirmed execution sent exactly one
native68 ID DELETE204, then two exact ID/name GETs. The first strictly validated
`DELETING` pair returned promptly with `deletion-processing` / `acknowledged-processing`
and `deleted identity-resolution Individual_ir01 (server is still processing)` in
human output. This success means the server accepted ongoing removal, not confirmed
absence. Only strict dual ID/name `ITEM_NOT_FOUND`404 supports `confirmed-deleted`.
Already-absent no-write unchanged behavior is implemented, but its installed repeat
was not exercised: later readback remained `DELETING_OFFCORE`, not terminal absence
or a validated processing pair. Optional full preservation/output accessibility
follow-up was incomplete. Never replay acknowledged/uncertain DELETE or fall back to
API67; reconcile read-only. Physical profile/output deletion remains unproven.

### Runtime identity resolution: standard CLI facade transport

The following is a separate historical, source-only low-level API qualification,
not the current plugin retrieve/deploy route described above.

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

Canonical commands are `sf data360 retrieve`, `sf data360 deploy` and exact native
`sf data360 delete`. `datacloud`, `d360` and `dc` are equivalent topic aliases,
including their flags and help; there are no `sf data` registrations. Aliases retain
canonical `sf-data360-*` envelopes, provenance command strings and `data360/...`
layout. The rename itself changed only plugin identity metadata; current native
API68/default behavior and operation-specific limits are described above.

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
may own the same topic. Installed public native mapping API68 acceptance used a
fresh local tarball, dedicated CLI profile and exact unsigned-package allowlist;
this is not registry-release or general cross-org acceptance.

### Read-only deploy preview

```sh
sf data360 deploy --preview -o target -d ./project/data360/dmo --json
sf data360 deploy --preview -o target -d ./authored.json -d ./more-authored.json
sf data360 deploy --preview -o target -m dmo:Example__dlm -m dmo:Another__dlm --json
```

Exactly one repeatable/non-greedy mode is required: `-d/--source-dir` selects explicit
files or directories; `-m/--metadata` selects exact project members from cwd.
No bare type, omitted selection or implicit deploy-all is allowed. All sources
resolve and validate before runtime target inspection; core optional-org flag authentication
still happens during parsing, before input resolution. Core `-o/--target-org` supports the
configured default org and explicit override; `--api-version` defaults to `auto`
(native API68, with explicit numeric pins preserved). Optional `--dataspace`
(`--data-space` alias) has no CLI default, with family-specific capability checks.
`--allow-field-removal` (default off) applies to native DMO inputs only: custom target
fields missing from the file are removed with a Metadata API destructive change, and
preview lists them in `removeFields`. A mapped field is removed only when the same
command deploys every mapping holding its pair without that pair. The removal runs
in the DMO position; Salesforce drops the field's pairs with it, and the mappings
deployed afterwards find them already gone. Native delete also requires exact selectors;
no omitted, bare-type or wildcard write selection is admitted.

The normal core JSON wrapper contains `sf-data360-deploy` contract version 1.0.0,
status/metadata/diagnostics/provenance/result and one advisory `preview` item per
input. Native `create` means a confirmed exact-target/pair absence lookup, not an
executed create.
`update` means an admitted family-specific delta, not an executed update;
`unchanged` means qualified no-op. `blocked-changes` and `blocked` make aggregate
status blocked/exit 1; unexpected failures make status failed/exit 1. Mixed results
remain visible. Preview writes no local artifact/report and performs no mutations.
Without `--preview`, the same explicit selection performs supported guarded creation
or bounded updates. Each deploy phase preflights all of its own items before its first write: a batch of
Segment, calculated insight or Identity Resolution inputs (with DLO/DMO files beside
them when no mapping or relationship is selected) is checked as a whole, so a known
blocker in it prevents all of its writes; Segments and calculated insights on an Identity
Resolution's unified DMO are checked only after that ruleset is `PUBLISHED`. When the
selection also holds a stream, a mapping, a relationship or a transform, only the local
checks of the later inputs (version, data space, file shape, dependency identities and
order) run before those earlier writes; their Git snapshot, prerequisite and target checks run in their own
phase, so a blocker there can follow writes from an earlier phase, and those writes stay
reported. Native batches instead
order DLO, DMO, mapping, relationship and admit/settle each item independently before dependent writes;
a later blocker can follow an earlier successful mutation. With
`--allow-field-removal`, a DMO with fields to remove runs its PATCH and then its
removal in the DMO position, before the selected mappings; a mapped field that no
selected mapping file releases refuses the batch before its first write. Native preview with only
planned parents reports `planned-dependencies`, target unknown and no absence proof,
not executable readiness. Each executor repeats fresh checks; unchanged items do not
write. Execution stops on the first blocked, failed or unknown-mutation item.
Neither route is atomic or provides a concurrency guarantee.
Execution items use `operation: execute`, `outcome: created|updated|unchanged|blocked|failed|not-attempted`,
`mutation: confirmed-created|confirmed-updated|not-attempted|unknown|rejected`, optional preflight and diagnostics.
`rejected` (DLO, DMO, mapping and relationship items) means Salesforce answered the item's first write with an HTTP 4xx status, so nothing was written for it; a failure after a completed write stays `unknown`.
Prior completed receipts remain visible; remaining items are explicitly not-attempted.
Only all-created/updated/unchanged results yield aggregate success/exit 0; blocked/failed
execution exits 1 even after prior mutations. Unknown mutation means creation or update may have
occurred: inspect target before another attempt. No retry or rollback. Native DLO additive
fields, native DMO updates and mapping desired-state reconciliation use their
separate profiles; Salesforce decides which mapping pairs it accepts.
Parser/auth flag errors retain core formatting. No public plan or saved-plan infrastructure.

## Scope and safety

Seven planned families are tracked in [capabilities](docs/capabilities.md). DMO
support uses the native route described under
[Public DMO workflow](#public-dmo-workflow).

The native DMO writer validates the document shape and writes
`data360/dmo/<ApiName>__dlm.dmo-meta.json` beneath the project root. Identical
bytes are unchanged; differing regular files require overwrite, and a file saved
for a different data space is not replaced even with overwrite. Linked ancestors,
linked destinations and directory/file collisions reject. Complete flushed staging
uses OS temp and atomic rename/exclusive hard-link publication; cross-volume
publication fails closed, with no copy fallback. There is a residual concurrent
filesystem replacement race between path validation and publication; this is not
a hostile-process filesystem sandbox.
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
