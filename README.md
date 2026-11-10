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
including exact source-backed Segment deletion with `--confirm-delete`.
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

| Resource                                   | Retrieve                                                                                                                                                                                                            | Create                                                                                                                            | Update                                                                                                                          | Delete                                                                                                                                                                      | Scope / limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data Model Objects (DMOs), `dmo`           | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                                                                                                               | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                             | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                           | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Exact native definition deletion" />                                                        | One native route, default/auto API68 (numeric pins from 61 kept): `data360/dmo/<ApiName>__dlm.dmo-meta.json`, all/type/exact retrieval, create or update by target name, exact-name delete. No local allowlists: category, field types, labels, descriptions and extra keys are sent as authored and Salesforce decides. Observed at API68 on empty, unmapped custom DMOs in the default data space: categories Profile, Engagement and Other; ten field data types; update of object label and description, existing field labels and added fields. Refused before any write: changing a field's data type or the primary key, removing a field, and any write to standard, namespaced or generated DMOs. Polled reads confirm writes; batches order DLO, DMO, mapping. Used by `--include-dependencies` and `--changed-since`. Mapped or data-bearing DMOs, non-default data spaces, relationships and other API versions are not verified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Data Lake Objects (DLOs), `dlo`            | Available <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native API68 definition retrieval" />                                                                                             | Available <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native API68 standalone definition creation" /> | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Label changes and ordinary field additions" />  | Available <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Exact target definition deletion" />                                                      | API68/default native definition CRUD through authenticated standard CLI; canonical `data360/dlo/<FullApiName>__dll.dlo-meta.json`, operation-specific payloads and target-name auto POST/PATCH replace handcrafted requests. Metadata retrieval worked at 65–68 but complete-schema redeploy hit PK/qualifier failures. Explicit preview is read-only; delete executes without prompting. Not ingestion or cascade cleanup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| DLO-to-DMO mappings, `mapping`             | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native mapping retrieval" />                                                                                                        | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native mapping creation" />                       | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Qualified desired-state pair reconciliation" /> | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Guarded unmap-first non-last deletion" />                                                   | Canonical native JSON; default/auto API68, numeric pins preserved. All/type/exact retrieval; explicit deploy/delete only. Installed API68 acceptance covers create, canonical retrieval, one additive pair, JSON Text removal with batch addition, both Text retarget directions and zero-write previews/repeats. Guarded API61..68/default68 deletion (62..67 assumed compatible) unmaps qualified authored identity Text/Number pairs before protected-only deletion, with an independently qualified other-source survivor. Installed API61/68 two-Text-pair deletion and zero-write last-for-DMO preview/execution guards passed; installed Number removal is not qualified. Empty custom fixture scope only; the API61 deletion fixtures were provisioned at API68. Separate installed API61 create/read/single-add acceptance with omitted scope passed. Desired-state removal/retargeting remain API68-only. Installed API68 cross-org acceptance additionally covers exact source retrieval, target-local DLO/DMO rebinding, create, one additive Text pair, GET-only repeat and guarded selected deletion with an unchanged survivor; final owned source/target mappings and parents remain under the accepted last-mapping limitation. Not general cross-org schemas, populated objects or released-package qualification. |
| DMO field relationships, `relationship`    | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                                                                                                               | Unavailable                                                                                                                       | Unavailable                                                                                                                     | Unavailable                                                                                                                                                                 | Exact API65/default standard XML export only; no inventory, dependency expansion or plugin operational deploy admission. Installed source-only exact-export acceptance passed; semantic/cross-org acceptance remains unproved.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Data Transforms, `data-transform` | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Exact native API68 definition retrieval" /> | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Explicit create-only definition POST" /> | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Exact-ID label and description update" /> | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Guarded exact-ID delete with inventory settlement" /> | One exact canonical CUSTOM/BATCH/STL definition, API68/default only; compatible existing DLO prerequisites. Explicit create/update, GET-only preview and unchanged repeat, processing acknowledgment for changed execution. No upsert, run/schedule, provisioning, mixed/Git/dependency expansion. Exact-ID delete requires the matching source file and `--confirm-delete`; unconfirmed settlement is reported nonzero. Offline regressions/local installed checks are separate from unperformed live public lifecycle acceptance. Native zero-row qualification is separate. |
| Source object definitions                  | Unavailable                                                                                                                                                                                                         | Unavailable                                                                                                                       | Unavailable                                                                                                                     | Unavailable                                                                                                                                                                 | Definition XML only, not connectors or credentials.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Data Streams, `data-stream`                | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Exact native stream retrieval" />                                                                                                   | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Guarded Ingestion API stream creation" />         | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Additive nonprimary Text mapping update" />     | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Guarded exact stream deletion" />                                                           | Exact stream-only API68/default Ingestion API/Other/UPSERT subset; portable JSON, preview and processing acknowledgement. Installed cross-org qualification covers source create/retrieve, connectionName-only target remap/create/retrieve, additive Text update, zero-write repeat and explicit cascade cleanup on both sides. Preserve-DLO deletion has separate bounded evidence. Not general connectors, populated data, other API versions or released-package qualification.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Calculated insights, `calculated-insight`  | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" /> <img src="assets/icons/cli.svg" width="20" height="20" alt="CLI" title="Standard Salesforce CLI operation" /> | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Bounded API68 draft creation" />                  | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                           | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Source-bound asynchronous deletion; historical confirmation failures remain unexplained" /> | Explicit API68/default bounded draft create/edit, separate NOT_SCHEDULED publish, ACTIVE expression edit and source-paired delete; installed cross-org byte-identical pair retrieval and GET-only no-op passed. Later delete passed after seven polls, but two earlier unconfirmed completions remain unexplained; all fixtures independently absent. Auto remains legacy65. No calculation/general SQL guarantee.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Segments, `segment`                        | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native JSON definition retrieval" /> | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Bounded absent-target creation" /> | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Bounded existing definition update" /> | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Source-backed confirmed deletion" />                                                                                                                                                                 | Exact single-model DBT portable `.segment.json`; native JSON-only API68/default retrieve, absent-target CREATE, bounded existing UPDATE and source-backed confirmed DELETE have installed acceptance. CREATE/UPDATE require processing acknowledgement; DELETE requires exact source agreement and explicit confirmation, with independent absence verification. Separate same-version DMO detail/Metadata reads validate dependencies, not a companion Segment XML file. Historical API65 XML-paired qualification remains separate. Later conservative DELETE processing-guard refinement is offline-qualified, not a newly installed build acceptance. No general cross-org, arbitrary SQL, completed computation, generated-resource or physical-cleanup claim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Segment members                            | Unavailable                                                                                                                                                                                                         | Unavailable                                                                                                                       | Unavailable                                                                                                                     | Unavailable                                                                                                                                                                 | Bounded membership reads, not a full population export. Runtime rows are outside plugin configuration scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Data Graphs, `data-graph`                  | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                                                                                                               | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native API68 root-only creation" />                                                                                                                       | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                           | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native API68 guarded definition deletion" /> | Plugin: explicit68/default standard Individual NONE recursive retrieve and guarded label/description/additive projection/relationship UPDATE, preserving retained multihop bindings; strict root-only absent create and exact-artifact confirmed delete. Installed description UPDATE and zero-write repeats passed; broader portability is unqualified. Known-empty dependencies required; exhaustive external consumers and generated-resource/storage/credit cleanup unverified. Auto/API67 facade retains existing-ready forward LastName append and qualified IR-owner binding/expansion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Identity Resolution, `identity-resolution` | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                                                                                                               | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native API68 guarded owner creation" />                                                                                                                       | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="API-led operation" />                           | Partial <img src="assets/icons/api.svg" width="20" height="20" alt="API" title="Native API68 acknowledged-processing owner deletion" /> | Plugin: native API68/default Individual full-settings retrieve, absent-owner CREATE and existing-owner PATCH; ordered source priorities, field overrides/reset and 12 generated output/link bindings verified. Processing acknowledgement required; bounded asynchronous settlement and conservative unknown outcomes. Source-backed confirmed DELETE has installed API68 acknowledged-processing acceptance; terminal absence/repeat and full optional preservation follow-up remain unverified. No explicit computation or physical-cleanup guarantee.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Kit templates                              | Unavailable                                                                                                                                                                                                         | Unavailable                                                                                                                       | Unavailable                                                                                                                     | Unavailable                                                                                                                                                                 | Stored snapshots, not runtime Graph/IR creation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Kit definitions                            | Unavailable                                                                                                                                                                                                         | Unavailable                                                                                                                       | Unavailable                                                                                                                     | Unavailable                                                                                                                                                                 | Combined owned container/template/member transport, not successful runtime installation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Kit membership                             | Unavailable                                                                                                                                                                                                         | Unavailable                                                                                                                       | Unavailable                                                                                                                     | Unavailable                                                                                                                                                                 | Creation/deletion qualified only with its container/template, not independently.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

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

This closes the exercised API61 create/read/single-add omission path, not general
CRUD or inventory pagination. API61 is the lowest live-tested success for these
mapping operations in this record, not a universal introduction claim. API60 GET404
is separate evidence, not POST/PATCH/DELETE rejection proof. API62–67 operation
qualification remains open; their deletion compatibility is still assumed. Desired-state
removal and retarget remain API68-only. No nondefault space, ingestion, populated data
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
  version; native mapping deletion admits 61.0 through 68.0 (62..67 assumed compatible). Legacy routes remain family-specific
  (API65 legacy families; API67 Graph/Ingestion and historical IR adapters), not the latest API.
  Public IR retrieval/deployment uses native API68 for default/`auto` or explicit `68.0`.
  `--api-version latest` is not accepted.
- DMOs have one route, the native one, with the artifact
  `data360/dmo/<ApiName>__dlm.dmo-meta.json`. The plugin applies no local allowlist for
  category, field data types, label length, descriptions or extra keys; Salesforce
  decides and its error is reported. The plugin refuses, before any write, what
  Salesforce cannot do (changing an existing field's data type, moving the primary
  key, removing a field) and any write to a standard, namespaced or generated DMO.
  The documented API behaviour is observed at API68 on empty, unmapped custom DMOs in
  the default data space only; see [Public DMO workflow](#public-dmo-workflow). Mapped
  or data-bearing DMOs, non-default data spaces, other API versions, relationships and
  SQL/flex DMOs are not verified.
- Native DLO/DMO creation and updates, mapping creation and qualified API68/default
  desired-state pair reconciliation, native API68 Segment DBT absent-target creation,
  label/description or qualified forward empty-audience predicate updates, CI predicate updates,
  native API68 IR full-settings create/update and Graph
  projection updates are separate bounded profiles. Explicit native batches settle DLOs, then
  DMOs, then mappings. General DLO schema edits and unqualified mapping changes are not enabled.
  IR provisioning is limited to the qualified Individual profile described below. Graph
  creation/deletion is a separate narrow native API68 profile, not facade provisioning.
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

Run stream commands separately from DMO and mapping commands. The native mixed
DLO → DMO → mapping deploy order does **not** include Data Streams. For the exact
DMO and mapping document contracts, see [Public DMO workflow](#public-dmo-workflow)
and [DLO-to-DMO mapping](#dlo-to-dmo-mapping-native-definition-crud).

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
schema support. Exact stream-only selections are required; inventory retrieval,
mixed-family batches, Git selection and dependency expansion are not supported.

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

### Native API68 recursive retrieve, bounded update and guarded create/delete

Use explicit `--api-version 68.0` to retrieve one exact `NONE` Graph in default
space, rooted in the enabled standard `ssot__Individual__dlm`. Recursive retrieval
preserves projected fields, key qualifiers, relationship paths, retained generated
bindings and refresh configuration, including qualified multihop branches.
Retrieve writes `force-app/main/default/data360/dataGraphs/ExampleGraph.native-dataGraph.json`
(or the configured source package), a distinct `kind: native-data-graph`,
`apiVersion: 68.0` document. Retained bindings are independently matched to the
target; source-org record IDs do not become target authority. The facade
`.dataGraph.json` format is unchanged and is not a native input.

```sh
sf data360 retrieve -o source -m data-graph:ExampleGraph --api-version 68.0 -d ./project --json
sf data360 deploy -o target --source-dir ./project/force-app/main/default/data360/dataGraphs/ExampleGraph.native-dataGraph.json --api-version 68.0 --preview --json
sf data360 deploy -o target --source-dir ./project/force-app/main/default/data360/dataGraphs/ExampleGraph.native-dataGraph.json --api-version 68.0 --allow-processing --json
sf data360 delete -o target -m data-graph:ExampleGraph --source-dir ./project/force-app/main/default/data360/dataGraphs/ExampleGraph.native-dataGraph.json --api-version 68.0 --preview --json
sf data360 delete -o target -m data-graph:ExampleGraph --source-dir ./project/force-app/main/default/data360/dataGraphs/ExampleGraph.native-dataGraph.json --api-version 68.0 --confirm-delete --json
```

Native deploy/delete accept auto or API68; retrieval requires explicit68 to choose
this profile. Absent-target deploy creates after independent absence/root checks
and requires `--allow-processing`: creation automatically materializes supporting
resources and defaults to daily full refresh with incremental refresh disabled,
even though the authored create input omits a schedule. CREATE remains the separate
root-only profile with ordered Text Id, key-qualifier and FirstName fields; recursive
retrieval/UPDATE does not enable recursive CREATE. Preview is read-only. One Graph
per operation; native Git selection, mixed families, dependency expansion and
cascade are unavailable.

For an existing target, edit the retrieved native definition, preview, then deploy
with `--allow-processing`. Bounded UPDATE admits label/description changes and
qualified additive projections/related objects, including multihop relationships.
The full target definition supplies retained fields, branches, qualifiers, both join
endpoints, generated identities and configuration. Omitting retained fields or
branches preserves them; it is not a removal request. Root/API identity, key,
qualifier, type, reparenting, join and refresh-setting changes or unsupported
nonvolatile properties block rather than silently discard data.

Native deploy accepts `--wait-timeout <positive integer seconds>`, default `1800`,
covering readiness, the write and settlement within one invocation budget. GET
retry/poll waits are at least 20 seconds, subject to the remaining deadline.
Executing an existing-target workflow warns upfront on stderr: processing can take
seconds to many minutes, up to 30 minutes depending on objects, fields, data volume
and service load. This is not a completion guarantee. Retry progress stays on
stderr in human and JSON modes; optional `--json` produces clean structured stdout.
Before its single guarded PUT, UPDATE independently requires item `ready`, metadata
`Ready` and the exact DataGraph record's `READY` / `ACTIVE` state and target binding.
Independent post-write readiness and full preservation, not the response echo,
establish `updated` / `confirmed-updated`. An identical ready definition returns
zero-write `unchanged` without processing acknowledgement. PUT HTTP 429/503,
timeouts and uncertain outcomes are not automatically replayed.

November 5 qualification separately verified native API label, description,
additive-field, child and multihop changes. Installed public CLI acceptance made
one description-only PUT and independently confirmed full recursive preservation;
subsequent JSON/human repeats were unchanged with zero writes. A final fresh archive
verified stderr warning and clean JSON output using zero-write checks, not another
PUT. These bounded results do not establish general cross-org portability.

Delete requires the exact selector, matching local native artifact and
`--confirm-delete`. Fresh ready state, org/identity/created-date, full definition,
root and explicitly empty known native dependency/related-segment arrays are
rechecked before deletion. Unknown or nonempty dependencies block; **exhaustive
external-consumer exclusion remains unverified**. Independent definition absence
was confirmed after live API68 create/read/delete qualification. Earlier stale
metadata readback required reconciliation; do not replay an uncertain mutation.
Generated DMOs, mappings, transforms, internal state, storage and credits cleanup
are not proven, nor is successful computation. Earlier installed-package CRD smoke
covered command routing with offline seams; the separate installed UPDATE evidence
above does not establish a complete live cross-org lifecycle. GUI UPDATE alone is
not native REST or plugin qualification.

### Existing API67 facade workflow

The following limits and examples apply to facade artifacts only. Repeat exact `-m data-graph:ApiName` selectors with `retrieve` or `deploy`, including
`--preview` and `--changed-since`. Use `--api-version auto` (fixed Graph67 and
legacy65 routes) or numeric67 for Graph-only selection. Numeric65 and
latest refuse Graph; mixed Graph/legacy selection requires auto. Inventory and
legacy Graph dependency expansion are unavailable. Existing-owner IR-qualified
unified Individual roots support explicit/reversed owner/Graph retrieval and deploy,
and `--include-dependencies` can include the exact owner. Retrieve discovers ownership
only from exact native IR inventory output names, then independently acquires the
owner, verifies all twelve returned outputs and qualifies the root's Text fields
and sole explicit Id key. Ambiguous, absent or mismatched owners fail closed;
no generated suffixes or source IDs determine ownership.
Deploy expands only an exact local owner artifact in the configured source package;
a missing local owner remains an independently bound external prerequisite, never
an instruction to create one. IR executes before Graph. All pending bytes and
bindings are freshly admitted before any next write. After confirmed selected-owner
settlement, dependent bindings are refreshed only while complete Graph/transform
and root/output preservation evidence stays unchanged. Projection and wire payloads
translate the three logical root slots through fresh target-local bindings.
Legacy retrieval/deployment remains unchanged; its expansion is still unavailable.
Installed revision `518a219` additionally has bounded two-org existing-owner pair
retrieval, target Graph LastName update, independent full owner/twelve-output/root/
Graph/transform preservation and actual zero-write repeated pair deployment evidence.
IR owners were unchanged. This does not enable IR/Graph creation, prove portable
IR mutation or establish complete migration acceptance.

```sh
sf data360 retrieve -o source -m data-graph:ExampleGraph --api-version auto -d ./project --json
sf data360 deploy -o target -m data-graph:ExampleGraph --api-version auto --preview --json
sf data360 deploy -o target -m data-graph:ExampleGraph --api-version auto --allow-processing --json
```

Retrieve writes portable JSON at
`force-app/main/default/data360/dataGraphs/ExampleGraph.dataGraph.json` (or the
configured source package). Identical bytes are unchanged; different bytes require
`--overwrite`. No generated IDs, private observations or request-only
`creationMode` enter the file. An unsupported returned mode blocks projection.

Deploy supports only a ready existing root-only unified Individual graph: NONE,
ordered Text Id key/FirstName, seven-day refresh and incremental disabled. The one
supported edit appends non-key projected Text LastName while preserving the full
existing configuration. Update omits `creationMode`, requires `--allow-processing`
and may trigger automatic processing. Complete equality is zero mutations and
needs no acknowledgement. Create/delete, nested graphs, reverse projection,
label/description/schedule changes and other roots are blocked. Independent root
binding, completed owner-transform lineage, whole-selection admission and fresh
all-pending checks precede mixed-batch writes. Settlement is bounded to forty
minutes with independent ready/full-preservation confirmation; unknown outcomes
never replay. The installed existing-owner paired acceptance above covers the exact
LastName update and zero-write repeat, not arbitrary Graphs or product creation.

## Public calculated insight workflow

### Native API68 draft, publish and source-bound delete

Use explicit `--api-version 68.0` and default data space for the new native
lifecycle. Default/`auto` still selects the legacy API65 existing-ACTIVE workflow
below; internal native API64–68 feasibility is not public lifecycle qualification
at every version. Native runtime requests use API68; standard XML, SOAP Metadata
and prerequisite binding use independent API65 routes, reported separately.

Start with a validated correlated XML/JSON pair and compatible target-local DMO
fields. Exact runtime `ITEM_NOT_FOUND` plus independent Metadata absence is required
before create; a Metadata-only shell is not an absent target. Either pair member
selects the full component. For example, with a retrieved pair in `./ci-pair`:

```sh
sf data360 deploy -o target --source-dir ./ci-pair --api-version 68.0 --draft --preview --json
sf data360 deploy -o target --source-dir ./ci-pair --api-version 68.0 --draft --allow-processing --json
sf data360 publish -o target --source-dir ./ci-pair --api-version 68.0 --preview --json
sf data360 publish -o target --source-dir ./ci-pair --api-version 68.0 --allow-processing --json
sf data360 retrieve -o target -m calculated-insight:ExampleInsight__cio --api-version 68.0 -d ./project --json
sf data360 delete -o target -m calculated-insight:ExampleInsight__cio --source-dir ./ci-pair --api-version 68.0 --preview --json
sf data360 delete -o target -m calculated-insight:ExampleInsight__cio --source-dir ./ci-pair --api-version 68.0 --confirm-delete --json
```

`--draft` is required for absent-target create and DRAFT expression edits, retains
DRAFT, and never implicitly unpublishes ACTIVE. Publication is a separate explicit
`NOT_SCHEDULED` operation; no automatic publication or schedule conversion occurs.
ACTIVE edits omit `--draft` and preserve publication state. Only the two qualified
same-aggregation false-predicate expressions (with/without the DeviceId non-null
predicate) are admitted at API68, not arbitrary SQL, labels or schema changes.
Retrieve exports only settled ACTIVE owners. Full equality is GET-only unchanged,
without `--allow-processing`; mutations require that acknowledgement. A matching
already-ACTIVE publish is also unchanged. Preview never mutates.

Delete requires the exact selector, its matching XML/JSON ownership expectation,
`--confirm-delete` for a present owner, and fresh exact never-run DRAFT/ACTIVE
`NOT_SCHEDULED` content and dependency checks. This is configuration binding, not
proof of original creator. It never cascades or removes the local pair. A repeated
delete after independently confirmed dual absence is unchanged without confirmation.
Writes are attempted once; finite settlement (at most 12 native reads, one-second
intervals, 120-second outer deadline) requires independent runtime/Metadata evidence,
not the mutation response. Unknown outcomes stop without retry or rollback.

Installed cross-org API68 acceptance passed create, separate publish, byte-identical
retrieval of both frozen pair members, GET-only unchanged deployment and meaningful
ACTIVE expression edit. Both initial public deletes returned
`CI_DELETION_UNCONFIRMED`; later independent runtime/Metadata absence confirmed
cleanup. A later single-fixture installed delete returned exit 0 after six DELETING
observations and dual absence on poll seven (35.2 seconds command time). The earlier
failures remain unexplained: this success does not establish reliable completion
every time or a version-specific deletion defect. After an unconfirmed delete,
reconcile by independent reads; do not replay DELETE. All owned CI fixtures are now
confirmed absent. ACTIVE is not calculation proof; no run, ingestion, populated-data,
physical-storage/credit cleanup or released-package qualification is claimed.

### Legacy API65 existing-ACTIVE workflow

Exact `calculated-insight:Name__cio` selection is supported by `sf data360 retrieve`
and `sf data360 deploy` (including `--preview` and `--changed-since`). Repeat selectors
for multiple components. Use numeric `--api-version 65.0` or the default `auto`
(legacy API65 for this family), and the default data space. Omitted retrieve selectors
retrieve native DLO/DMO/mapping inventory, not inventory of every exact-only family.

Retrieve independently correlates native runtime, SOAP Metadata, target DMO field
bindings and standard project-retrieved XML before publishing any selected output.
It writes a correlated XML/JSON pair; either member selects the complete component.
Repeated identical retrieve is unchanged; differing output needs `--overwrite`.

```sh
sf data360 retrieve -o source -m calculated-insight:ExampleInsight__cio -d ./project --json
sf data360 deploy -o source -m calculated-insight:ExampleInsight__cio --preview --json
sf data360 deploy -o source -m calculated-insight:ExampleInsight__cio --allow-processing --json
```

Deploy supports an existing settled ACTIVE custom calculated metric only: the
qualified same-aggregation `APPROX_COUNT_DISTINCT(DeviceId)` expression may change
from `WHERE 1 = 0` to `WHERE 1 = 0 AND ...ssot__DeviceId__c IS NOT NULL`, preserving
the exact qualified engagement DMO, group-by, dimension/measure schema and schedule.
The admitted schedule is exactly `SYSTEM_MANAGED` or `NOT_SCHEDULED`, with null
schedule bounds; desired and target must have the same schedule. Complete semantic
equality is unchanged without a mutation. Creation, Metadata shell conversion,
reverse/broader SQL, label/schedule changes, inventory and CI
`--include-dependencies` expansion are blocked. No schedule is normalized or adapted.

For the target-bound workflow, retrieve the target's correlated XML/JSON pair and
locally edit only the qualified expression in both members, preserving its schedule.
Installed target-bound acceptance passed on October 29, 2026: one expression-only
PATCH returned HTTP 200, settled ACTIVE with `NOT_SCHEDULED` preserved, and independent
runtime/Metadata/dependency readback confirmed preservation. The actual public repeat
returned unchanged/not-attempted with zero mutations or explicit jobs. Run/error fields
stayed null; successful computation is not claimed. This workflow does not prove
unchanged-source-artifact cross-org portability: a `SYSTEM_MANAGED` source artifact
against a `NOT_SCHEDULED` target remains blocked. Runtime admission still requires
the existing never-run, error-free profile; a source reporting `SUCCESS` is not
admitted by that policy. No successful target calculation run is required. Existing compatible prerequisites
are always read and bound, even without expansion.

Preview never deploys. Execution admits the whole selection before writes,
requires `--allow-processing` for an update, verifies both input byte sets and fresh
bindings before mixed writes, and delegates at most one expression-only API65 PATCH
per CI to the bounded executor. Settlement requires independent runtime/Metadata
readback. Unknown outcomes stop the batch without replay or rollback. Attribution
and status observations stay private, not in artifacts or command results.
Synthetic public routing regressions are separate from the bounded installed
acceptance above; unchanged-source cross-org and successful-computation acceptance
remain unproved. The operational examples later in
this README describe separate API research, not additional plugin capabilities.

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
cwd. `-x/--overwrite` permits replacing a differing file; identical bytes are
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
  `isDynamicLookup` are accepted but never returned by reads. The plugin sends them
  when a field is created or otherwise edited, but cannot detect or confirm a change
  to them alone.
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
be updated"). A definition may omit generated and system fields. Omitting a custom
field that exists in the target counts as a removal and is refused.

After a write the plugin polls reads (up to 6, 5 seconds apart) until the requested
definition is confirmed. The write itself is never repeated. If the reads do not
confirm it, the command fails with `DMO_PERSISTENCE_UNCONFIRMED`; inspect the target
before another attempt. `--preview` performs reads only.

### Refused before any write

| Situation | Code |
| --- | --- |
| Changing an existing field's data type or moving the primary key. The API answers 200 and silently ignores it. | `UNSUPPORTED_DMO_FIELD_CHANGE` |
| Removing a field. There is no API route, and the Data Model UI offers no field deletion either. | `UNSUPPORTED_DMO_FIELD_CHANGE` |
| Adding a generated field or a second primary key. | `UNSUPPORTED_DMO_FIELD_ADDITION` |
| Deploy, delete or delete preview of a standard, namespaced (for example `ssot__Individual__dlm`) or platform-generated DMO (`creationType` not `Custom`). Mappings to such targets are refused as well. Retrieving these DMOs is allowed. | `UNSUPPORTED_DMO_TARGET` |

### Delete

Delete addresses the exact name only. It has no dependency preflight and no prompt;
`--preview` is read-only. Salesforce may cascade the deletion to the DMO's mapping.
See [Native plugin workflow](#native-plugin-workflow) for the confirmation states.

### Dependencies and Git selection

`--include-dependencies` and `--changed-since <ref>` use the native DMO file.

- A native DMO changed since a Git reference, or selected beside Segment, calculated
  insight, Data Graph or Identity Resolution inputs, joins the ordered batch.
- A standard or generated DMO pulled in only as a deploy prerequisite is reported
  with `DMO_PREREQUISITE_NOT_DEPLOYED` and never written. On retrieve, such a
  prerequisite still blocks publication with `UNSUPPORTED_DMO_TARGET`.
- An explicit selection of only native DLO, DMO and mapping files combined with
  `--include-dependencies` is blocked with `DMO_DEPENDENCY_EXPANSION_UNSUPPORTED`.

`--changed-since <ref>` is exclusive with `--metadata` and `--source-dir`. It selects
from the unique Git merge base, staged/unstaged changes and relevant untracked
files, and resolves the repository root even from nested directories. Relevant
renames/deletions block; a relevant untracked DMO addition plus **any tracked
worktree deletion** also blocks conservatively. Stage intended changes to permit
Git-inferred rename detection; unsupported lifecycle changes still block. A valid
empty selection succeeds without downstream target work, but existing parse-time
core authentication remains. Optional Git provenance records resolved commits, not
exact-byte binding. See [Git workflow](docs/git-workflow.md) for scope and
limitations.

### Not qualified and known limits

Mapped or data-bearing DMOs, non-default data spaces, API versions other than 68 for
the behaviour listed above, relationships, SQL/flex DMOs and released-package
acceptance have not been verified.

- Retrieve: a DMO selected beside another family (for example a Segment), or with
  `--include-dependencies`, still requires `--api-version auto` or `65.0` for the
  selection as a whole, although the DMO itself is read on the native route. A
  DMO-only selection without `--include-dependencies` accepts any version from 61.
- Retrieve with `--include-dependencies` stops when a selected component depends on
  a standard or platform-generated DMO (`UNSUPPORTED_DMO_TARGET`).
- A change to only a field's `description` or `isDynamicLookup` is reported as
  `unchanged`: Salesforce does not return these values, so the plugin cannot detect
  the difference. They are sent when the field is created or otherwise edited.
- `spec` must not contain `name`, `dataSpaceName` or runtime keys such as `id`; the
  object identity comes from `identity` only. Other extra `spec` keys are sent on
  create, and on update only when Salesforce returns the same key with another value.
- A new DMO whose name contains a double underscore before `__dlm` (a namespaced
  name) is refused with `UNSUPPORTED_DMO_TARGET` before any write.

## Metadata examples: prerequisites and qualification

The chapters below document **standard Salesforce CLI Metadata API retrieval**
and separately bounded mapping deployment, custom DMO deletion and custom relationship
lifecycle at API `65.0`. These `sf project` commands are provided by
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

Mapping list, detail, create, additive update and delete requests include the
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
definitions, including generated and system fields and key-qualifier references,
except the confirmed system-generated `KQ_Id__c` definition. Source record IDs and
runtime observations are excluded. Keys that only reads return (`creationType`,
`isDistinct`, `usageTag`, `keyQualifierName`) stay in the file and are never sent.
Differing files require `--overwrite`; identical bytes are unchanged. Standard,
namespaced and generated DMOs can be retrieved, but not deployed or deleted.

Deployment resolves the full target API name. Only confirmed HTTP404 permits
creation; other lookup failures stop. Creation sends the authored category, fields
(any data type), labels, descriptions and extra keys as written, without generated
fields; Salesforce decides and its error is reported. Existing targets use
name-based PATCH for the object label, the object description (absent
`spec.description` leaves it as is; an empty string clears it), existing field
labels and added fields. Changing an existing field's data type, moving the primary
key or removing a field is refused before any write (`UNSUPPORTED_DMO_FIELD_CHANGE`),
as is adding a generated field or a second primary key
(`UNSUPPORTED_DMO_FIELD_ADDITION`). A changed category is sent and Salesforce
rejects it. A PATCH response can still contain the old state, so the plugin polls
reads (up to 6, 5 seconds apart) to confirm; the write is never repeated.
Explicit native batches support DLO, DMO and mapping in that dependency order, with
independent parent settlement. `--include-dependencies` and `--changed-since` use
the same native file; see
[Dependencies and Git selection](#dependencies-and-git-selection).

Delete executes by default without prompting and addresses only the freshly
resolved full DMO name. There is no dependency preflight. `--preview` is strictly
read-only. Deploy, delete and delete preview refuse standard, namespaced and
platform-generated DMOs with `UNSUPPORTED_DMO_TARGET`. Already absent is
unchanged; the plugin performs no further deletion, local deletion, write retry or
rollback, but Salesforce may cascade the deletion to the DMO's mapping.
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
from Metadata XML deployment. Changing a field's data type, moving the primary key
and removing a field are not possible through the native API and are refused.

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
wrappers. It preserves returned field definitions except the confirmed
system-generated `KQ_Id__c` definition; other system fields remain saved.
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
without POST or PATCH; field ordering and the portable omission of ordinary generated
`KQ_Id__c` do not trigger a write. Only an authoritative
not-found response permits POST. Authentication, permission, malformed-response and
other lookup failures stop; a failed PATCH never falls back to POST. `--preview`
performs the target comparison without any mutation and is never the default.

Creation submits authored fields with the intended primary key, not generated
qualifier/system fields from retrieval. Salesforce generated those fields in the
verified standalone API 68 experiment. Local validation accepts nonempty `dataType`
strings rather than a Text-only allowlist; Other-category CREATE forwards authored
fields, and UPDATE admits label changes and ordinary nonprimary field additions
while preserving existing fields and primary-key configuration. This admission is
not live qualification of every field type: installed additive-field acceptance
here covers Text. Field removal, existing-field changes and primary-key mutation
remain blocked.
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
cleanup or local-file deletion is performed. Already absent is unchanged. Failed
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
Git/dependency expansion, mixed selection, run or schedule is offered.

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

Public delete: `sf data360 delete -m data-transform:Name -d <file>.dataTransform.json --transform-target-id <1dt id> --confirm-delete` (API68/default only; `--preview` is GET-only). It requires the exact matching file, a CUSTOM/BATCH/ACTIVE STL target with no schedule, and bounded visible-inventory presence of both ID and name. One native DELETE is sent without retry; confirmed deletion needs a complete inventory omitting both ID and name plus preserved source/output DLOs, otherwise the result is `deletion-unconfirmed` (nonzero, never replay). No DLO, run or data cleanup; exhaustive external-consumer exclusion is not established, and the pre-delete recheck narrows but does not eliminate concurrent-edit races.

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
from `61.0`. Installed API61 create/read/single-add acceptance with omitted scope
is recorded above; desired-state removal/retarget acceptance remains API68-only.
Bounded guarded deletion and last-for-DMO guards passed at API61 and API68. The
API61 deletion fixtures were provisioned at API68, independently of the later
API61 creation acceptance. API62..67 deletion compatibility remains an explicitly
accepted assumption, not live-qualified. `latest` is not a native
mapping route and dependency expansion remains unsupported.
Output is `data360/mapping/<name>.mapping-meta.json` beneath `--output-dir` (default cwd).
The document contains `schemaVersion: 1`, `kind: "mapping"`, logical `identity` and
`spec` with DLO/DMO developer-name bindings and field pairs. Retrieved field selectors
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

Creation resolves the exact DLO/DMO pair in the target and uses the target-generated
mapping name, not the source artifact name. An existing logically identical mapping
is a zero-write repeat. At API68/default, the existing `spec.fieldMappings` array is
the desired pair set: qualified omitted authored identity Text/Number pairs are
unmapped individually using fresh target selectors, then new Text pairs are added
in one names-only, selector-free PATCH. Qualified Text retargeting supports the same
source/new target and new source/same target directions. Generated/key pairs cannot
be omitted or changed; retained pairs keep their target selectors. All policy checks
precede the first removal. Shared or occupied authored targets, unknown metadata,
nonidentity removals and parent-binding changes are refused. Preview lists removals
before additions with zero writes. Exact final pairs, full parents and inventory are
independently checked, allowing only expected `isMapped` transitions. Partial or
unknown mutation stops immediately without write retry or rollback.

To remove an eligible custom field mapping, remove its pair from `spec.fieldMappings`
and deploy the complete JSON file. This removes the connection between the two
fields, not the DMO field itself, within the guarded scope above. Keep all protected
key, qualifier and system pairs. To retarget a field pair, replace the old pair with
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

These reconciliation paths are qualified by raw API68/default experiments on empty
custom definitions, with installed public API68 Text reconciliation acceptance below.
Populated-object, cross-org and other-version guarantees are not established. No
implicit parent creation or PK/KQ inference is performed outside explicitly selected,
supported parent definitions.

Installed public API68 acceptance on owned empty custom definitions covers ordered
parent/mapping creation, canonical retrieval, an unchanged zero-write redeploy, one
additive pair and a second zero-write repeat. That historical single Number addition
does not qualify installed Number removal. Installed JSON Text reconciliation also
passed removal of A with batch addition of D/E, then B-to-C same-source/new-target
retargeting and F-to-D new-source/same-target retargeting, sequentially on the same
empty fixture. Each reconciliation preview and repeat performed zero writes. Exact
desired pairs, retained selectors, full DLO state and DMO schema/nonflag properties
were independently verified, allowing only expected `isMapped` changes. Full raw
DMO preservation is therefore not claimed across reconciliation. This is not
populated-object, cross-org, arbitrary-schema or all-version qualification.

#### Guarded unmap-first native mapping deletion

```sh
sf data360 delete -m mapping:ExactTargetMappingName -o TARGET_ALIAS --api-version 68.0 --preview --json
sf data360 delete -m mapping:ExactTargetMappingName -o TARGET_ALIAS --api-version 68.0 --json
```

Deletion is admitted at API `61.0` through `68.0`; live qualification is limited to
the default-space empty-custom-object profile. Optional explicit scope does not
qualify nondefault deletion; default/`auto` remains `68.0`. Native API61
Text/Number unmap-first deletion passed with complete raw parent/survivor preservation.
API62..67 are an explicitly accepted compatibility assumption, not live-qualified.
API60's mapping read route returned 404 below the documented API61 floor; no API60
DELETE was attempted. Installed API61 and API68 public deletion acceptance each
unmapped two authored identity Text pairs and deleted the protected-only mapping:
exactly three DELETE responses of HTTP `204`. Independent reads confirmed typed
selected-mapping `404`, complete DLO parents, DMO schema/nonflag properties with only
expected mapped-flag changes, the unchanged survivor and exact fixture inventory.
Last-for-DMO preview and execution were both blocked with zero writes at API61/68.
API61 deletion fixtures were provisioned at API68; this deletion evidence does not
qualify API61 creation or installed Number removal. Separate installed API61
create/read/single-add evidence is recorded above. Exact fixture inventory checks are destructive-safety
proof, not successful public bare/type inventory retrieval acceptance. Desired-state
removal/retarget remains API68-only; create, noop and existing single-add behavior are unchanged. Before any writes, complete fresh inventory must prove
another source's mapping independently covers all five metadata-qualified protected
pairs (primary key, qualifier and three system pairs). The last mapping for a DMO is
blocked before any unmaps. Last-for-DLO alone is not a blocker. An already-absent mapping
is conservatively blocked without writes; unchanged-on-404 handling applies only to
native DLO/DMO deletion.

The ordered plan first unmaps each qualified authored identity Text/Number pair using
its fresh observed selector, then deletes the protected-only mapping once. Shared
authored targets, unsupported metadata/types and ambiguous inventory are refused.
`--preview` performs zero writes and reports the ordered selectors without payloads.
Every write is followed by bounded GET-only checks of complete DLO/DMO schemas,
remaining mappings and retained selectors. Only the expected authored target's
`isMapped` true-to-absent transition is allowed during unmapping; final deletion must
preserve the complete pre-final schema. Survivor content is checked even while
`CREATING`, then must settle `ACTIVE`. Typed selected-mapping 404 and exact remaining
inventory are required, not merely an accepted DELETE response.

During `sf data360 delete`, every mapping read (detail, list), field unmap and final
mapping DELETE, plus the DLO/DMO parent reads, is sent on a bound authenticated
connection instead of a child `sf api request rest`: no
token refresh, no HTTP retry, redirects refused, so each request is sent at most once.
A DELETE is accepted with HTTP `200` or `204`; deletion is only confirmed by the
later typed-404 reads. An expired session stops the command with HTTP
401 instead of refreshing; log in again and rerun after a read-only check. Mapping
deploy writes are unchanged.

Direct non-last native DELETE HTTP `204` previously removed DMO `Count__c`/`Gamma__c`
fields and triggered `MAPPING_PARENT_CHANGED`; survivor coverage alone was insufficient.
The qualified unmap-first sequence avoids admitting that direct-delete path, but does
not establish populated-object, cross-org or all-version guarantees. Any partial or
lost-response failure stops the batch with mutation unknown, including after the first
unmap. There is no parent DELETE, override, artificial survivor creation, automatic
retry, rollback or local artifact deletion. Desired-state deployment uses the same
guarded individual unmap checks within the reconciliation scope described above.

Supporting API68 route tests rejected retargeting only the DLO, only the DMO, or both
with HTTP `404` input-binding mismatch for both last and secondary mappings; original
bindings, pairs, selectors and parents remained unchanged. Separate owned-empty-object
observations explain the guard: DMO deletion cascaded its mapping but left the DLO;
a second DMO using the same DLO did not unlock deletion of the original mapping
(HTTP `500`), whereas a second distinct DLO mapped to the same DMO enabled non-last
DELETE204. These are limitations, not alternate plugin workflows or cleanup advice.

### DMO field relationship: `FieldSrcTrgtRelationship`

#### Read / Retrieve

The plugin supports exact definition-only export for one or multiple named relationships:

```sh
sf data360 retrieve --target-org SOURCE_ALIAS --api-version 65.0 -m relationship:ExactRelationshipName -m relationship:AnotherRelationshipName --json
```

Use exact developer names in the `default` data space. The default API version,
explicit `65.0`, and `auto` use the fixed Metadata API65 route; other numeric pins
and `latest` are rejected. Output uses the configured package source root and
`fieldSrcTrgtRelationships/<name>.fieldSrcTrgtRelationship-meta.xml`, retaining exact
XML bytes. Identical files are unchanged; differing files require `--overwrite`.
Independent member failures retain successful exports and return a nonzero aggregate.

Each successful relationship result includes `family: "relationship"`,
`definitionOnly: true`, `deployable: false`, and its actual API65 Metadata route.
Here `deployable: false` means this plugin's operational deploy does not admit the
export; it does not prohibit standard Metadata deployment by other tools.
Inventory, dependency expansion, operational file/Git deploy admission and semantic
compatibility are not supported. Isolated installed source-only acceptance on
October 29, 2026 verified exact XML against independent standard retrieval,
configured output, unchanged repeat, API65/auto routing, duplicate selection and
local deploy-input rejection. Multiple distinct members and failure continuation
remain synthetic-test evidence only; semantic and cross-org acceptance are unproved. The custom plugin command is not an
out-of-the-box Salesforce CLI command; the table's API icon describes its API-led
export mechanism.

For comparison, the following is a separate out-of-the-box Salesforce CLI retrieve:

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
Git. No public relationship create/update/delete wrapper is implemented; the exact
definition-only retrieve above does not authorize this lifecycle. Do not apply the observed
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

Delete with `sf data360 delete --metadata segment:<name> --source-dir <file>`;
`--preview` is read-only and execution requires `--confirm-delete`. The saved
JSON must agree with fresh target identity, definition and dependency checks.
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

### Native identity resolution: plugin retrieve and deploy

Public `sf data360 retrieve` and `sf data360 deploy` use native API68 for default/`auto`
or explicit `--api-version 68.0`, in the default data space. They support the qualified
Individual profile, not arbitrary IR configurations. An absent exact owner is created
with one POST; an existing owner with a supported configuration difference receives one
full-settings PATCH. A semantically equal settled owner returns `unchanged` with no write.

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
guessing generated output names. Legacy artifacts without an explicit `trustedSources`
field require fresh native retrieval before deployment.

The admitted shape has `configurationType: Individual`, `doesRunAutomatically: false`,
`isCaseSensitive: true`, empty filters and explicit `trustedSources: []`. Match rules
retain their labels, target-bound fields, Fuzzy/Exact/ExactNormalized methods and
blank/case flags; installed CREATE exercised FirstName Fuzzy, LastName Exact and
email ExactNormalized. All six standard reconciliation entities are required.
Object defaults and field overrides support LastUpdated, MostFrequent and SourceSequence
within the validated profile. A case-sensitive FirstName criterion and nonempty trusted
sources are unsupported. Owner names are `Individual` or `Individual_` followed by
one to four alphanumeric characters. Validated configuration is not evidence of live
qualification for every possible match combination or another API version.

CREATE and PATCH automatically publish and can cause processing even with automatic
run disabled: execution requires `--allow-processing`, including generated-output
provisioning for CREATE. Preview is read-only. Success requires bounded asynchronous
settlement to `PUBLISHED`, independently equal full supported settings and all 12
verified generated unified/link output bindings. A transport acknowledgement alone is
not success. Settlement has finite read/time limits; an unconfirmed post-write outcome
is conservatively `unknown` and stops the batch without automatic retry or rollback.
Inspect that exact target before deciding what to do next. This is not an SLA or a
zero-effects/draft guarantee, and no explicit run or profile-computation claim is made.

Installed API68 source-org acceptance covers full-settings CREATE, exact canonical
retrieval and a zero-write unchanged repeat with 12 stable output bindings. Separate
qualified native PATCH evidence covers matching, object defaults, ordered source
priorities, field overrides, override reset and inheritance. This does not establish
general cross-org migration or released-package qualification. Separately installed
API68 DELETE acceptance covers read-only preview and acknowledged ongoing removal,
not terminal absence or physical profile-row removal.

For DELETE, select one exact owner and its matching canonical file; preview is read-only,
and present execution requires `--confirm-delete` (not `--allow-processing`):

```sh
sf data360 delete --metadata identity-resolution:Individual_ir01 --source-dir force-app/main/default/data360/identityResolution/Individual_ir01.identityResolution.json --target-org source --api-version 68.0 --data-space default --preview --json
sf data360 delete --metadata identity-resolution:Individual_ir01 --source-dir force-app/main/default/data360/identityResolution/Individual_ir01.identityResolution.json --target-org source --api-version 68.0 --data-space default --confirm-delete --json
```

DELETE admits default/auto or explicit68 in default space, a qualified settled
nonautomatic Individual owner, exact source/settings/output/dependency checks and a
fresh target-local ID. No wildcard/batch, cascade or manual generated-DMO deletion.
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
(`--data-space` alias) has no CLI default, with family-specific capability checks. Native delete also requires exact selectors;
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
or bounded updates. Batches containing Segment, calculated insight, Data Graph or
Identity Resolution inputs preflight the whole selection before the first write, so a
known blocker prevents all writes. Native batches instead
order DLO, DMO, mapping and admit/settle each item independently before dependent writes;
a later blocker can follow an earlier successful mutation. Native preview with only
planned parents reports `planned-dependencies`, target unknown and no absence proof,
not executable readiness. Each executor repeats fresh checks; unchanged items do not
write. Execution stops on the first blocked, failed or unknown-mutation item.
Neither route is atomic or provides a concurrency guarantee.
Execution items use `operation: execute`, `outcome: created|updated|unchanged|blocked|failed|not-attempted`,
`mutation: confirmed-created|confirmed-updated|not-attempted|unknown`, optional preflight and diagnostics.
Prior completed receipts remain visible; remaining items are explicitly not-attempted.
Only all-created/updated/unchanged results yield aggregate success/exit 0; blocked/failed
execution exits 1 even after prior mutations. Unknown mutation means creation or update may have
occurred: inspect target before another attempt. No retry or rollback. Native DLO additive
fields, native DMO updates and API68/default mapping desired-state reconciliation
use their separate profiles. Mapping removal/retargeting outside the qualified
empty-custom-definition scope remains blocked.
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
